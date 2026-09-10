import { ImageResponse } from "next/og"

import { cargarFuente } from "./fonts"
import { Lamina, Portada, type Slide } from "./templates"
import { ESTILO_POR_DEFECTO, LIENZO, type Estilo } from "./theme"

/**
 * Convierte un slide en un PNG cuadrado de 1080x1080.
 *
 * El motor es Satori, via `next/og`: renderiza un arbol de React a imagen sin
 * navegador headless. Se eligio sobre Puppeteer porque en serverless un Chromium
 * son cientos de megas y varios segundos de arranque por invocacion, mientras
 * que esto rinde en milisegundos y ya viene con Next.
 *
 * El precio es que Satori entiende un subconjunto de CSS; las plantillas estan
 * escritas para eso.
 */

/** Instagram no admite carruseles de mas de 10, ni de menos de 2. */
export const MAX_SLIDES = 10
export const MIN_SLIDES = 2

/** Tope de la foto de portada: descargarla entera si es enorme no aporta. */
const MAX_FOTO_BYTES = 8 * 1024 * 1024

/**
 * Baja la foto de la noticia y la deja como data URI.
 *
 * Devuelve `null` ante cualquier problema —404, tipo raro, timeout, demasiado
 * grande— y nunca lanza: una portada sin foto sigue siendo una portada, pero un
 * carrusel a medias no es nada.
 */
export async function descargarFoto(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HancelBot/1.0)" },
    })
    if (!response.ok) return null

    const tipo = response.headers.get("content-type") ?? ""
    // Satori solo dibuja mapas de bits; un SVG remoto no le sirve.
    if (!/^image\/(jpeg|jpg|png|webp|gif)/i.test(tipo)) return null

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FOTO_BYTES) return null

    const base64 = Buffer.from(buffer).toString("base64")
    return `data:${tipo.split(";")[0]};base64,${base64}`
  } catch {
    return null
  }
}

export type SlideRender = {
  slide: Slide
  /** Solo la portada la usa; el resto la ignora. */
  foto?: string | null
}

export async function renderSlide(
  { slide, foto }: SlideRender,
  total: number,
  estilo: Estilo = ESTILO_POR_DEFECTO
): Promise<Buffer> {
  const fonts = await cargarFuente(estilo.fuente)

  const elemento =
    slide.type === "photo_hook" ? (
      <Portada slide={slide} total={total} estilo={estilo} foto={foto ?? null} />
    ) : (
      <Lamina slide={slide} total={total} estilo={estilo} />
    )

  const respuesta = new ImageResponse(elemento, {
    width: LIENZO,
    height: LIENZO,
    fonts,
  })

  return Buffer.from(await respuesta.arrayBuffer())
}

/**
 * Normaliza lo que venga en `respuesta.slides`.
 *
 * Igual que con las otras rutinas, el contrato lo escribe un prompt y puede
 * llegar torcido: se aceptan las variantes plausibles y se recorta al maximo que
 * Instagram admite en vez de fallar por un slide de mas.
 */
export function parseSlides(valor: unknown): Slide[] {
  const bruto = Array.isArray(valor) ? valor : []
  const slides: Slide[] = []

  for (const item of bruto) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const n = slides.length + 1

    const tipo = String(obj.type ?? "").trim()
    if (tipo === "photo_hook") {
      slides.push({ n, type: "photo_hook", hook: texto(obj.hook) ?? texto(obj.title) })
      continue
    }

    const title = texto(obj.title) ?? texto(obj.titulo)
    const body = texto(obj.body) ?? texto(obj.cuerpo) ?? texto(obj.text)
    if (!title && !body) continue

    slides.push({ n, type: "text", title, body })
  }

  return slides.slice(0, MAX_SLIDES)
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const limpio = valor.trim()
  return limpio.length > 0 ? limpio : null
}
