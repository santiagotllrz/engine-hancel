import type { RawNews } from "@/lib/types"

import { supabaseAdmin } from "../supabase-admin"
import { terminosDeBusqueda } from "./keywords"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "./pexels"
import {
  descargarFoto,
  MAX_SLIDES,
  MIN_SLIDES,
  necesitanFoto,
  parseSlides,
  renderSlide,
  repartirVariantes,
} from "./render"
import { subirCarrusel } from "./storage"
import type { Slide } from "./templates"
import { ESTILO_POR_DEFECTO, type Estilo } from "./theme"

/**
 * De la respuesta de la rutina de Instagram al carrusel subido.
 *
 * Igual que con las otras redes, la app es la que materializa: la rutina solo
 * escribe su buzon. Aqui ademas hay dos pasos que las otras no tienen —buscar
 * fotos y dibujar— que pueden fallar por motivos ajenos al texto.
 */

export type CarouselPayload = {
  caption: string
  hashtags: string[]
  /** En orden: es el orden del carrusel. */
  images: string[]
  slideCount: number
  /** Si la portada salio sin foto, para poder revisarlo despues. */
  portadaSinFoto: boolean
  /** Con que se buscaron las fotos de banco, para entender por que salieron esas. */
  terminosFoto: string[]
  /** Creditos de Pexels: la licencia no lo exige, pero se agradece. */
  creditos: { autor: string; url: string }[]
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
 * 1080x1350 y hacerlas a la vez dispara la memoria de la funcion sin ganar gran
 * cosa, porque el cuello es el propio render.
 */
export async function generarCarrusel(
  pieceKey: string,
  respuesta: unknown,
  news: RawNews | null,
  estilo: Estilo = ESTILO_POR_DEFECTO,
  nichos: string[] = []
): Promise<CarouselPayload> {
  const { caption, hashtags, slides } = parseInstagramResponse(respuesta)

  // El cierre es una lamina de marca, no del guion: se añade aqui y no se le
  // pide a la rutina. Si el guion ya llega al tope de Instagram, se recorta uno
  // para hacerle sitio en vez de pasarse.
  const conCierre = estilo.cierre.activo
  if (conCierre && slides.length >= MAX_SLIDES) slides.length = MAX_SLIDES - 1

  const variantes = repartirVariantes(slides, estilo.usarFotos && pexelsConfigurado())
  if (conCierre) {
    slides.push({ n: slides.length + 1, type: "text", title: estilo.cierre.titulo, body: estilo.cierre.texto })
    variantes.push("cierre")
  }
  const conFoto = necesitanFoto(variantes)

  const terminos = terminosDeBusqueda(news, nichos)
  const banco = new BancoDeFotos(terminos)
  const creditos: { autor: string; url: string }[] = []

  /** Una foto nueva del banco, o `null` si ya no queda ninguna sin usar. */
  const delBanco = async (): Promise<string | null> => {
    if (!estilo.usarFotos || !pexelsConfigurado()) return null

    // `siguiente()` no repite dentro del mismo post: lleva la cuenta de lo ya
    // servido y va agotando terminos antes que reutilizar una foto.
    const elegida = await banco.siguiente()
    if (!elegida) return null

    const descargada = await descargarFotoPexels(elegida)
    if (descargada && elegida.autor) {
      creditos.push({ autor: elegida.autor, url: elegida.autorUrl })
    }
    return descargada
  }

  // La portada se resuelve antes que nada y con red de seguridad, porque es la
  // unica lamina que no puede salir sin foto: es lo que frena el pulgar en el
  // feed, y una portada de solo texto sobre negro es un post que nadie abre.
  //
  // Primero el banco, que da fotos grandes y distintas en cada post. Si no
  // devuelve nada —sin clave de Pexels, red caida, terminos agotados— se recurre
  // a la imagen de la noticia: es una miniatura de unos 300px y se ve mas
  // blanda, pero una portada blanda es mejor que una portada vacia.
  const fotoPortada = (await delBanco()) ?? (await descargarFoto(news?.image_url))
  const sinFotoPortada = fotoPortada === null

  // El antetitulo situa el post antes de que nadie lea el titular. Sale del tema
  // del segmento, que es lo mas concreto que la noticia trae siempre.
  const etiqueta = (news?.tema ?? news?.niche ?? "").trim() || null

  const imagenes: Buffer[] = []

  for (const [indice, slide] of slides.entries()) {
    const foto =
      indice === 0
        ? fotoPortada
        : conFoto[indice] || variantes[indice] === "cierre"
          ? await delBanco()
          : null

    imagenes.push(
      await renderSlide(
        { slide, variante: variantes[indice], foto, etiqueta },
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
    portadaSinFoto: sinFotoPortada,
    terminosFoto: terminos.slice(0, 6),
    creditos,
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

/** Los slugs de categoria, que son lo implicito y no deben buscarse en el banco. */
export async function nichosConocidos(accountId: string): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("engine_categories")
    .select("slug")
    .eq("account_id", accountId)
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug)
}

export { MAX_SLIDES, MIN_SLIDES }
