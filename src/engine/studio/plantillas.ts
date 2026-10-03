import { supabaseAdmin } from "../supabase-admin"
import { esTipo, normalizarEstilo, TIPOS, TIPOS_ESTILO, type TipoEstilo } from "@/lib/plantillas-catalogo"
import { dibujarConCanva, type EstiloUsable, type PiezaParaDibujar } from "./canva"

/**
 * Los estilos graficos de cada cuenta.
 *
 * Cada cuenta parte de los cuatro estilos base (Infografia, Data-viz,
 * Fotografico, Ilustracion) con sus descripciones y valores por defecto, y los
 * ajusta a su marca. Son transversales: cualquier receta, en cualquier canal y
 * formato, usa uno.
 */

/** Crea los estilos que le falten a la cuenta. Idempotente. */
export async function asegurarEstilos(accountId: string): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("content_templates").select("id, tipo").eq("account_id", accountId)
  const filas = (data ?? []) as { id: string; tipo: string | null }[]

  // La plantilla de antes (un diseno por formato, sin tipo) era fotografica: se
  // convierte en el estilo Fotografico en vez de dejarla huerfana, y la receta
  // que la usaba sigue funcionando.
  const vieja = filas.find((f) => !f.tipo)
  if (vieja && !filas.some((f) => f.tipo === "fotografico")) {
    await supabase
      .from("content_templates")
      .update({
        tipo: "fotografico",
        name: TIPOS.fotografico.nombre,
        descripcion: TIPOS.fotografico.descripcion,
        estilo: TIPOS.fotografico.estilo,
        format: null,
        status: "lista",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vieja.id)
    vieja.tipo = "fotografico"
  }

  const faltan = TIPOS_ESTILO.filter((t) => !filas.some((f) => f.tipo === t))
  if (faltan.length === 0) return
  await supabase.from("content_templates").insert(
    faltan.map((t) => ({
      account_id: accountId,
      tipo: t,
      name: TIPOS[t].nombre,
      descripcion: TIPOS[t].descripcion,
      estilo: TIPOS[t].estilo,
      status: "lista",
    }))
  )
}

export type EstiloCompleto = EstiloUsable & { name: string; descripcion: string }

/** Un estilo listo para usar: tipo, valores normalizados y descripcion. */
export async function estiloDe(templateId: string, accountId: string): Promise<EstiloCompleto | null> {
  const { data } = await supabaseAdmin()
    .from("content_templates")
    .select("id, tipo, name, descripcion, estilo")
    .eq("id", templateId)
    .eq("account_id", accountId)
    .maybeSingle()
  const t = data as { id: string; tipo: string | null; name: string; descripcion: string | null; estilo: unknown } | null
  if (!t || !esTipo(t.tipo)) return null
  return {
    id: t.id,
    tipo: t.tipo,
    name: t.name,
    descripcion: t.descripcion?.trim() || TIPOS[t.tipo].descripcion,
    estilo: normalizarEstilo(t.estilo, t.tipo),
  }
}

/** Contenido de ejemplo para la muestra de cada estilo: portada y una lamina. */
const MUESTRAS: Record<TipoEstilo, PiezaParaDibujar> = {
  fotografico: {
    title: "",
    body: "",
    fotos: ["coffee farmer hands harvest", "coffee cherries branch"],
    elemento: "",
    slides: [
      { n: 1, type: "photo_hook", hook: "La cosecha de café se decide en la floración.", foto: "coffee farmer hands harvest" },
      { n: 2, type: "text", title: "Una flor que se cae es un grano que no llega.", body: "El estrés hídrico en floración recorta la cosecha antes de que se vea.", foto: "coffee plant flowers" },
    ],
  },
  ilustracion: {
    title: "",
    body: "",
    fotos: [],
    elemento: "",
    slides: [
      { n: 1, type: "photo_hook", hook: "Así se toma una muestra de suelo bien hecha.", visual: "A farmer kneeling in a coffee field taking a soil sample with a small shovel and a bucket, simple friendly character" },
      { n: 2, type: "text", title: "Recorre el lote en zigzag.", body: "Toma 15 a 20 submuestras y mézclalas en un balde limpio.", etiquetas: ["Zigzag", "20 puntos", "Balde limpio"], visual: "Top view of a field plot with a zigzag dotted path and small markers where samples are taken" },
    ],
  },
  infografia: {
    title: "",
    body: "",
    fotos: [],
    elemento: "",
    slides: [
      { n: 1, type: "photo_hook", hook: "Las partes del grano de café", body: "Lo que hay dentro de cada cereza", visual: "A single ripe red coffee cherry cut in half showing the two green coffee beans, the pulp and the skin" },
      { n: 2, type: "text", title: "Lo que hay dentro de una cereza", body: "Cada capa cumple una función", etiquetas: ["Pulpa dulce", "Pergamino", "Grano verde", "Cáscara roja"], visual: "Cross-section of a coffee cherry showing skin, pulp, parchment and two green beans, isolated" },
    ],
  },
  dataviz: {
    title: "",
    body: "",
    fotos: [],
    elemento: "",
    slides: [
      {
        n: 1,
        type: "photo_hook",
        hook: "Ejemplo: así se ve una cifra protagonista",
        grafico: { tipo: "cifras", unidad: "", items: [{ etiqueta: "Cifra de ejemplo", valor: "12,5 %", variacion: "sube", nota: "Dato ilustrativo, no real" }] },
        fuente: "Ejemplo",
        periodo: "Muestra del estilo",
      },
      {
        n: 2,
        type: "text",
        title: "Ejemplo: una barra destaca el dato clave",
        grafico: { tipo: "barras", unidad: "", items: [{ etiqueta: "Categoría A", valor: 82 }, { etiqueta: "Categoría B", valor: 64 }, { etiqueta: "Categoría C", valor: 41 }, { etiqueta: "Categoría D", valor: 27 }] },
        fuente: "Ejemplo",
        periodo: "Muestra del estilo",
      },
    ],
  },
}

/**
 * Dibuja una muestra del estilo en Canva (portada y una lamina, en 4:5) para
 * verlo antes de usarlo en una receta. Guarda las laminas en la plantilla.
 */
export async function muestraDeEstilo(templateId: string, accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const estilo = await estiloDe(templateId, accountId)
  if (!estilo) return { ok: false, error: "No existe ese estilo." }
  const supabase = supabaseAdmin()
  await supabase.from("content_templates").update({ status: "creando", error: null }).eq("id", templateId)

  const r = await dibujarConCanva({
    estilo,
    pieza: MUESTRAS[estilo.tipo],
    // La muestra se compone como carrusel: portada + lamina, sin cierre.
    formatId: "ig_carrusel",
    titulo: `Muestra · ${estilo.name}`,
    accountId,
    pieceId: `muestra-${templateId}`,
    terminosRespaldo: ["agriculture field"],
  })

  if (!r.ok) {
    await supabase.from("content_templates").update({ status: "error", error: r.error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", templateId)
    return r
  }
  await supabase
    .from("content_templates")
    .update({
      status: "lista",
      error: null,
      thumbnail_url: r.imagenes[0] ?? null,
      canva_design_id: r.designId,
      canva_edit_url: r.editUrl,
      estructura: { muestras: r.imagenes },
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
  return { ok: true }
}
