import { descargarFoto, renderSlide } from "@/engine/render/render"
import type { Slide } from "@/engine/render/templates"

export const dynamic = "force-dynamic"

/**
 * Previsualiza una lamina del carrusel sin tener que generar uno entero.
 *
 * Existe para poder ajustar la plantilla —colores, tamaños, margenes— viendo el
 * resultado al instante en el navegador, que es la unica forma sensata de
 * afinar algo visual.
 *
 *   /api/render/preview?tipo=portada&hook=...&foto=https://...
 *   /api/render/preview?tipo=texto&title=...&body=...&n=2&total=5
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tipo = url.searchParams.get("tipo") ?? "portada"
  const n = Number(url.searchParams.get("n") ?? 1) || 1
  const total = Number(url.searchParams.get("total") ?? 5) || 5

  const slide: Slide =
    tipo === "portada"
      ? {
          n,
          type: "photo_hook",
          hook:
            url.searchParams.get("hook") ??
            "OpenAI supo durante meses que sus agentes usaban canales no autorizados",
        }
      : {
          n,
          type: "text",
          title: url.searchParams.get("title") ?? "El problema no es la capacidad",
          body:
            url.searchParams.get("body") ??
            "Investigadores externos detectaron el patron antes que la propia empresa. Eso no habla de los agentes: habla de quien los vigila.",
        }

  const foto =
    slide.type === "photo_hook" ? await descargarFoto(url.searchParams.get("foto")) : null

  const png = await renderSlide({ slide, foto }, total)

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  })
}
