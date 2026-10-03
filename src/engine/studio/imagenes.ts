import { supabaseAdmin } from "../supabase-admin"
import { claveComposio, COMPOSIO_USER } from "./canva-conexion"

/**
 * Imagenes generadas para los estilos Ilustracion e Infografia.
 *
 * Se piden a Gemini (Nano Banana) a traves de Composio, en su modo sin
 * autenticacion: no hace falta otra clave, lo paga la cuenta de Composio.
 *
 * Las imagenes se piden SIN texto. El texto de una pieza lo pone siempre el
 * compositor, con su tipografia y sus tildes: un generador de imagenes escribe
 * mal el espanol y se inventa rotulos. Al prompt de cada imagen se le suma el
 * "estilo visual" de la plantilla y su paleta, que es lo que hace que todas las
 * imagenes de un carrusel parezcan del mismo conjunto.
 */

const API = "https://backend.composio.dev/api/v3.1/tools/execute/GEMINI_GENERATE_IMAGE"
const BUCKET = "carousels"

export type Proporcion = "1:1" | "4:5" | "9:16" | "16:9" | "3:4" | "4:3"

/** La proporcion soportada mas cercana a un hueco. */
export function proporcionPara(ancho: number, alto: number): Proporcion {
  const r = ancho / alto
  const opciones: [Proporcion, number][] = [
    ["9:16", 9 / 16],
    ["3:4", 3 / 4],
    ["4:5", 4 / 5],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["16:9", 16 / 9],
  ]
  return opciones.reduce((mejor, o) => (Math.abs(o[1] - r) < Math.abs(mejor[1] - r) ? o : mejor))[0]
}

/**
 * Genera una imagen y la deja en el storage. Devuelve su url publica, o null si
 * fallo: una pieza sin una imagen sigue saliendo, con el hueco resuelto.
 */
export async function generarImagen(opciones: {
  prompt: string
  estiloVisual: string
  colores: string[]
  proporcion: Proporcion
  ruta: string
}): Promise<{ url: string } | { error: string }> {
  const clave = await claveComposio()
  if (!clave) return { error: "Falta la clave de Composio." }

  const prompt = [
    opciones.prompt.trim(),
    opciones.estiloVisual.trim(),
    opciones.colores.length ? `Color palette limited to: ${opciones.colores.join(", ")}.` : "",
    "Absolutely no text, letters, numbers, words, captions, watermarks or logos anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ")

  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "x-api-key": clave, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: COMPOSIO_USER,
          arguments: { model: "gemini-2.5-flash-image", aspect_ratio: opciones.proporcion, prompt },
        }),
        signal: AbortSignal.timeout(150_000),
      })
      const json = (await res.json().catch(() => null)) as {
        successful?: boolean
        error?: string | null
        data?: { image?: { s3url?: string; mimetype?: string } }
      } | null
      const s3 = json?.data?.image?.s3url
      if (!res.ok || !json?.successful || !s3) {
        if (intento === 0) continue
        return { error: (json?.error || `Gemini respondio ${res.status}`).slice(0, 300) }
      }

      // La url de Composio es temporal: la imagen se copia al storage propio.
      const img = await fetch(s3, { signal: AbortSignal.timeout(60_000) })
      if (!img.ok) return { error: "No se pudo descargar la imagen generada." }
      const buffer = Buffer.from(await img.arrayBuffer())
      const tipo = json.data?.image?.mimetype || "image/png"
      const { error } = await supabaseAdmin().storage.from(BUCKET).upload(opciones.ruta, buffer, { contentType: tipo, upsert: true })
      if (error) return { error: `No se pudo guardar la imagen: ${error.message}` }
      return { url: supabaseAdmin().storage.from(BUCKET).getPublicUrl(opciones.ruta).data.publicUrl }
    } catch (error) {
      if (intento === 0) continue
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { error: "Gemini no respondio." }
}
