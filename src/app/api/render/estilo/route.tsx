import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { descargarFoto, renderSlide } from "@/engine/render/render"
import { renderNoticia } from "@/engine/render/estilos-noticia"
import { estiloDesdeConfig, PLANTILLAS, type Plantilla } from "@/engine/render/theme"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * La previsualizacion de un estilo de noticia, para elegirlo en Marca.
 *
 * Dibuja la portada (o una lamina interior) con una noticia real reciente de la
 * cuenta, su logo y su configuracion, en el estilo pedido:
 *
 *   /api/render/estilo?plantilla=impacto&lamina=portada
 *   /api/render/estilo?plantilla=editorial&lamina=interior
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const pedida = url.searchParams.get("plantilla") ?? "clasica"
  const plantilla: Plantilla = (PLANTILLAS as readonly string[]).includes(pedida) ? (pedida as Plantilla) : "clasica"
  const interior = url.searchParams.get("lamina") === "interior"

  const accountId = await idDeCuentaActual()
  const s = supabaseAdmin()
  const [{ data: cfg }, { data: noticias }] = await Promise.all([
    s.from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle(),
    s
      .from("raw_news")
      .select("title, snippet, tema, niche, image_url, created_at")
      .eq("account_id", accountId)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ])
  const estilo = { ...estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel), plantilla }
  const lista = (noticias ?? []) as { title: string; snippet: string | null; tema: string | null; niche: string | null; image_url: string | null; created_at?: string }[]
  const n = lista[0] ?? { title: "El precio del café sube por tercera semana seguida", snippet: null, tema: "café", niche: null, image_url: null }
  const fecha = new Date(n.created_at ?? Date.now()).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })

  // La foto de la noticia: si no se deja bajar, prueba con la siguiente.
  let foto: string | null = null
  for (const x of lista) {
    foto = await descargarFoto(x.image_url)
    if (foto) break
  }
  const titular = n.title.replace(/\s+/g, " ").trim()
  const nicho = (n.tema ?? n.niche ?? "").trim()
  const cuerpo = (n.snippet ?? "").trim() || "Lo que cambia para los productores y qué mirar en los próximos días."

  let png: Buffer
  if (plantilla === "editorial" || plantilla === "impacto" || plantilla === "periodico") {
    const [logoClaro, logoOscuro] = await Promise.all([descargarFoto(estilo.logoClaro), descargarFoto(estilo.logoOscuro)])
    png = await renderNoticia({
      plantilla,
      composicion: interior ? "foto" : "portada",
      titular: interior ? "Lo que hay detrás del dato" : titular,
      cuerpo: interior ? cuerpo : null,
      nicho,
      fecha,
      foto,
      n: interior ? 2 : 1,
      total: 6,
      logoClaro,
      logoOscuro,
      estilo,
    })
  } else if (plantilla === "plogy") {
    const { renderPlogy, fotoEnByN } = await import("@/engine/render/plogy")
    const [logoClaro, logoOscuro] = await Promise.all([descargarFoto(estilo.logoClaro), descargarFoto(estilo.logoOscuro)])
    png = await renderPlogy({
      composicion: interior ? "texto" : "portada",
      fondo: interior ? "papel" : "tinta",
      titular: interior ? "Lo que hay *detrás* del dato" : titular,
      cuerpo: interior ? cuerpo : null,
      foto: interior ? null : await fotoEnByN(foto),
      n: interior ? 2 : 1,
      total: 6,
      tema: nicho,
      handle: estilo.marca,
      logoClaro,
      logoOscuro,
    })
  } else {
    png = interior
      ? await renderSlide({ slide: { n: 2, type: "text", title: "Lo que hay detrás del dato", body: cuerpo }, variante: "foto_lateral", foto }, 6, estilo)
      : await renderSlide({ slide: { n: 1, type: "photo_hook", hook: titular }, variante: "portada", foto, etiqueta: nicho }, 6, estilo)
  }

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" },
  })
}
