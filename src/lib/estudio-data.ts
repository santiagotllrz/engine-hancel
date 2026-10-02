import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import { getSettings } from "@/engine/schedule"

/**
 * Lo que produce el pipeline nuevo, agrupado por pilar.
 *
 * Cada pilar es como una marca dentro de la cuenta: tiene sus ideas, sus
 * recetas y sus piezas. Esta vista es la mesa del estudio: que salio, de que
 * idea, con que receta, y como quedo.
 */

export type PiezaEstudio = {
  id: string
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

  const [pilares, piezas, recetas, cartuchos] = await Promise.all([
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position"),
    supabase
      .from("studio_pieces")
      .select("id, pillar_id, recipe_id, cartridge_id, status, channel, format, payload, error, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("content_recipes").select("id, name, pillar_id, enabled").eq("account_id", accountId),
    supabase.from("content_cartridges").select("id, pillar_id, idea, status").eq("account_id", accountId),
  ])

  const recetasPorId = new Map(
    ((recetas.data ?? []) as { id: string; name: string; pillar_id: string; enabled: boolean }[]).map((r) => [r.id, r])
  )
  const cartuchosLista = (cartuchos.data ?? []) as { id: string; pillar_id: string; idea: string; status: string }[]
  const ideaPorCartucho = new Map(cartuchosLista.map((c) => [c.id, c.idea]))

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
    lista.push({
      id: f.id,
      status: f.status,
      channel: f.channel,
      format: f.format,
      createdAt: f.created_at,
      fecha: formato.format(new Date(f.created_at)),
      error: f.error,
      receta: f.recipe_id ? (recetasPorId.get(f.recipe_id)?.name ?? null) : null,
      idea: f.cartridge_id ? (ideaPorCartucho.get(f.cartridge_id) ?? null) : null,
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
