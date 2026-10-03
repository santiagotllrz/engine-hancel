import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import { getSettings } from "@/engine/schedule"
import { formatoPorId } from "@/lib/canales-catalogo"

/**
 * Lo que produce el pipeline nuevo, agrupado por pilar.
 *
 * Cada pilar es como una marca dentro de la cuenta: tiene sus ideas, sus
 * recetas y sus piezas. Esta vista es la mesa del estudio: que salio, de que
 * idea, con que receta, y como quedo.
 */

/** Con que se hizo una pieza: cada capa del bloque 1 y del bloque 2. */
export type FichaPieza = {
  pilar: string | null
  tema: string | null
  subtema: string | null
  intencion: string | null
  narrativa: string | null
  cta: string | null
  canal: string | null
  formato: string | null
  estilo: string | null
  receta: string | null
  generador: string | null
}

export type PiezaEstudio = {
  id: string
  ficha: FichaPieza
  status: "generating" | "generated" | "published" | "failed"
  channel: string
  format: string
  createdAt: string
  /** La fecha ya escrita en la zona de la cuenta: asi no cambia entre servidor y navegador. */
  fecha: string
  error: string | null
  receta: string | null
  idea: string | null
  imagenes: string[]
  caption: string
  hashtags: string[]
  /** Texto de la pieza cuando no hay imagenes (o para leerla sin abrirlas). */
  laminas: { titulo: string; cuerpo: string }[]
  parrafos: string[]
  canvaEditUrl: string | null
  aviso: string | null
}

export type PilarEstudio = {
  id: string
  name: string
  cartuchosDisponibles: number
  recetasActivas: number
  piezas: PiezaEstudio[]
}

type Payload = {
  imagenes?: string[]
  caption?: string
  hashtags?: string[]
  slides?: { hook?: string; title?: string; body?: string }[]
  title?: string
  body?: string
  parrafos?: string[]
  canva_edit_url?: string | null
  aviso?: string
  plantilla_id?: string
  /** La ficha guardada al generar. Las piezas viejas no la tienen. */
  capas?: Partial<Record<keyof FichaPieza, string | null>>
}

export async function getEstudio(): Promise<PilarEstudio[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const { timezone } = await getSettings(accountId)
  const formato = new Intl.DateTimeFormat("es-CO", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })

  const [pilares, piezas, recetas, cartuchos, temas, subtemas, intenciones, narrativas, estilos] = await Promise.all([
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position"),
    supabase
      .from("studio_pieces")
      .select("id, pillar_id, recipe_id, cartridge_id, status, channel, format, payload, error, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("content_recipes").select("id, name, pillar_id, enabled, generator, template_id").eq("account_id", accountId),
    supabase
      .from("content_cartridges")
      .select("id, pillar_id, idea, status, topic_id, subtopic_id, intent_id, narrative_id")
      .eq("account_id", accountId),
    supabase.from("content_topics").select("id, name").eq("account_id", accountId),
    supabase.from("content_subtopics").select("id, name").eq("account_id", accountId),
    supabase.from("content_intents").select("id, name").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name").eq("account_id", accountId),
    supabase.from("content_templates").select("id, name").eq("account_id", accountId),
  ])

  const nombres = (data: unknown) => new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
  const nPilar = nombres(pilares.data)
  const nTema = nombres(temas.data)
  const nSub = nombres(subtemas.data)
  const nInt = nombres(intenciones.data)
  const nNarr = nombres(narrativas.data)
  const nEstilo = nombres(estilos.data)
  const nombre = (m: Map<string, string>, id: string | null | undefined) => (id ? (m.get(id) ?? null) : null)

  type Receta = { id: string; name: string; pillar_id: string; enabled: boolean; generator: string; template_id: string | null }
  const recetasPorId = new Map(((recetas.data ?? []) as Receta[]).map((r) => [r.id, r]))
  type Cartucho = {
    id: string
    pillar_id: string
    idea: string
    status: string
    topic_id: string | null
    subtopic_id: string | null
    intent_id: string | null
    narrative_id: string | null
  }
  const cartuchosLista = (cartuchos.data ?? []) as Cartucho[]
  const cartuchoPorId = new Map(cartuchosLista.map((c) => [c.id, c]))

  type Fila = {
    id: string
    pillar_id: string | null
    recipe_id: string | null
    cartridge_id: string | null
    status: PiezaEstudio["status"]
    channel: string
    format: string
    payload: Payload | null
    error: string | null
    created_at: string
  }

  const porPilar = new Map<string, PiezaEstudio[]>()
  for (const f of (piezas.data ?? []) as Fila[]) {
    // Las piezas viejas no guardaban el pilar: se saca de su receta.
    const pilar = f.pillar_id ?? (f.recipe_id ? recetasPorId.get(f.recipe_id)?.pillar_id : null)
    if (!pilar) continue
    const p = f.payload ?? {}
    const lista = porPilar.get(pilar) ?? []
    const receta = f.recipe_id ? recetasPorId.get(f.recipe_id) : undefined
    const cartucho = f.cartridge_id ? cartuchoPorId.get(f.cartridge_id) : undefined
    const fmt = formatoPorId(f.format)
    // La ficha guardada al generar manda; lo que falte (piezas de antes de
    // guardarla) se reconstruye desde el cartucho y la receta de origen.
    const g = p.capas ?? {}
    const ficha: FichaPieza = {
      pilar: g.pilar ?? nombre(nPilar, pilar),
      tema: g.tema ?? nombre(nTema, cartucho?.topic_id),
      subtema: g.subtema ?? nombre(nSub, cartucho?.subtopic_id),
      intencion: g.intencion ?? nombre(nInt, cartucho?.intent_id),
      narrativa: g.narrativa ?? nombre(nNarr, cartucho?.narrative_id),
      cta: g.cta ?? null,
      canal: fmt?.canal.nombre ?? f.channel,
      formato: fmt?.formato.nombre ?? f.format,
      estilo: g.estilo ?? nombre(nEstilo, p.plantilla_id ?? receta?.template_id),
      receta: g.receta ?? receta?.name ?? null,
      generador: (g.generador ?? receta?.generator) === "canva" ? "Canva" : (g.generador ?? receta?.generator) ? "Solo texto" : null,
    }
    lista.push({
      id: f.id,
      ficha,
      status: f.status,
      channel: f.channel,
      format: f.format,
      createdAt: f.created_at,
      fecha: formato.format(new Date(f.created_at)),
      error: f.error,
      receta: ficha.receta,
      idea: cartucho?.idea ?? null,
      imagenes: p.imagenes ?? [],
      caption: p.caption ?? "",
      hashtags: p.hashtags ?? [],
      laminas: (p.slides ?? []).map((s) => ({ titulo: s.hook || s.title || "", cuerpo: s.body || "" })),
      parrafos: p.parrafos ?? (p.title ? [p.title, p.body ?? ""].filter(Boolean) : []),
      canvaEditUrl: p.canva_edit_url ?? null,
      aviso: p.aviso ?? null,
    })
    porPilar.set(pilar, lista)
  }

  return ((pilares.data ?? []) as { id: string; name: string }[]).map((pilar) => ({
    id: pilar.id,
    name: pilar.name,
    cartuchosDisponibles: cartuchosLista.filter((c) => c.pillar_id === pilar.id && c.status === "available").length,
    recetasActivas: [...recetasPorId.values()].filter((r) => r.pillar_id === pilar.id && r.enabled).length,
    piezas: porPilar.get(pilar.id) ?? [],
  }))
}
