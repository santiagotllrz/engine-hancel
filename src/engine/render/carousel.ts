import type { RawNews } from "@/lib/types"

import { supabaseAdmin } from "../supabase-admin"
import {
  descargarFoto,
  MAX_SLIDES,
  MIN_SLIDES,
  parseSlides,
  renderSlide,
} from "./render"
import { subirCarrusel } from "./storage"
import type { Slide } from "./templates"
import { ESTILO_POR_DEFECTO, type Estilo } from "./theme"

/**
 * De la respuesta de la rutina de Instagram al carrusel subido.
 *
 * Igual que con las otras redes, la app es la que materializa: la rutina solo
 * escribe su buzon. Aqui ademas hay un paso extra —dibujar y subir— que puede
 * fallar por motivos ajenos al texto (una foto caida, el storage), y por eso el
 * fallo se cuenta aparte del de la rutina.
 */

export type CarouselPayload = {
  caption: string
  hashtags: string[]
  /** En orden: es el orden del carrusel. */
  images: string[]
  slideCount: number
  /** Si la portada salio sin foto, para poder revisarlo despues. */
  portadaSinFoto: boolean
}

/** Lo que la rutina deja en `jobs_instagram.respuesta`. */
export function parseInstagramResponse(respuesta: unknown): {
  caption: string
  hashtags: string[]
  slides: Slide[]
} {
  const raiz = (respuesta ?? {}) as Record<string, unknown>

  const slides = parseSlides(raiz.slides)
  if (slides.length < MIN_SLIDES) {
    throw new Error(
      `La rutina de Instagram devolvio ${slides.length} slides utiles y hacen falta al menos ` +
        `${MIN_SLIDES}. Se esperaba {"caption":"...","hashtags":[...],"slides":[{"n":1,` +
        `"type":"photo_hook","hook":"..."},{"n":2,"type":"text","title":"...","body":"..."}]}.`
    )
  }

  const caption = typeof raiz.caption === "string" ? raiz.caption.trim() : ""
  const hashtags = Array.isArray(raiz.hashtags)
    ? raiz.hashtags
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`))
    : []

  return { caption, hashtags, slides }
}

/**
 * Dibuja y sube el carrusel entero.
 *
 * Las imagenes se generan en serie y no en paralelo: son hasta diez PNG de
 * 1080x1080 y hacerlas a la vez dispara la memoria de la funcion sin ganar gran
 * cosa, porque el cuello es el propio render.
 */
export async function generarCarrusel(
  pieceKey: string,
  respuesta: unknown,
  news: RawNews | null,
  estilo: Estilo = ESTILO_POR_DEFECTO
): Promise<CarouselPayload> {
  const { caption, hashtags, slides } = parseInstagramResponse(respuesta)

  // La foto solo la usa la portada, asi que se baja una vez o ninguna.
  const necesitaFoto = slides.some((s) => s.type === "photo_hook")
  const foto = necesitaFoto ? await descargarFoto(news?.image_url) : null

  const imagenes: Buffer[] = []
  for (const slide of slides) {
    imagenes.push(
      await renderSlide(
        { slide, foto: slide.type === "photo_hook" ? foto : null },
        slides.length,
        estilo
      )
    )
  }

  const images = await subirCarrusel(pieceKey, imagenes)

  return {
    caption,
    hashtags,
    images,
    slideCount: slides.length,
    portadaSinFoto: necesitaFoto && foto === null,
  }
}

/** La noticia de la que salio el angulo, para la foto de portada. */
export async function noticiaDelAngulo(angleId: string): Promise<RawNews | null> {
  const supabase = supabaseAdmin()

  const { data: angle } = await supabase
    .from("content_angles")
    .select("raw_news_id")
    .eq("id", angleId)
    .maybeSingle()

  const rawNewsId = (angle as { raw_news_id: string } | null)?.raw_news_id
  if (!rawNewsId) return null

  const { data } = await supabase.from("raw_news").select("*").eq("id", rawNewsId).maybeSingle()
  return (data as RawNews) ?? null
}

export { MAX_SLIDES, MIN_SLIDES }
