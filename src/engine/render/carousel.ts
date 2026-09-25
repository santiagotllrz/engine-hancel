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
import { subirCarrusel, subirImagenSuelta } from "./storage"
import type { Slide } from "./templates"
import { ESTILO_POR_DEFECTO, type Estilo } from "./theme"

/**
 * De la respuesta del agente de Instagram al carrusel subido.
 *
 * Igual que con las otras redes, la app es la que materializa: el agente solo
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
  /**
   * La portada redibujada para Facebook, sin numeracion ni "desliza".
   *
   * Facebook publica una sola imagen, asi que reutilizar la del carrusel metia
   * en el feed un "1 / 6" y una invitacion a deslizar que no llevan a ninguna
   * parte. Es la misma lamina y la misma foto, dibujada otra vez sin esos dos
   * elementos: una llamada mas a Satori y ni una a Pexels.
   */
  portadaFacebook?: string
}

/** Lo que el agente deja en `jobs_instagram.respuesta`. */
/**
 * Arregla la palabra que no se puede publicar mal.
 *
 * Al modelo se le pide en el prompt que escriba con tildes y con eñe, y casi
 * siempre lo hace, pero "anos" por "años" no es una falta como las demas: es
 * otra palabra, y bastante desafortunada. Es la unica que se corrige en codigo
 * porque es la unica donde el arreglo es seguro —"anos" no aparece de verdad
 * en una noticia del campo— y el fallo, caro.
 *
 * El resto de tildes no se toca: no hay forma fiable de saber si "cayo" era
 * "cayó" o el arbol, y un arreglo a medias es peor que ninguno.
 */
function arreglarEnies(texto: string): string {
  return texto.replace(/anos/gi, (m) => (m[0] === "A" ? "Años" : "años"))
}

export function parseInstagramResponse(respuesta: unknown): {
  caption: string
  hashtags: string[]
  slides: Slide[]
  /** Las busquedas de foto que eligio quien escribio el carrusel. */
  fotos: string[]
  /** La cosa concreta que va recortada en la portada. Vacio = sin elemento. */
  elemento: string
} {
  const raiz = (respuesta ?? {}) as Record<string, unknown>

  const slides = parseSlides(raiz.slides).map((slide) =>
    slide.type === "photo_hook"
      ? { ...slide, hook: slide.hook ? arreglarEnies(slide.hook) : slide.hook }
      : {
          ...slide,
          title: slide.title ? arreglarEnies(slide.title) : slide.title,
          body: slide.body ? arreglarEnies(slide.body) : slide.body,
        }
  )
  if (slides.length < MIN_SLIDES) {
    throw new Error(
      `El agente de Instagram devolvio ${slides.length} slides utiles y hacen falta al menos ` +
        `${MIN_SLIDES}. Se esperaba {"caption":"...","hashtags":[...],"slides":[{"n":1,` +
        `"type":"photo_hook","hook":"..."},{"n":2,"type":"text","title":"...","body":"..."}]}.`
    )
  }

  const caption = typeof raiz.caption === "string" ? arreglarEnies(raiz.caption.trim()) : ""
  const hashtags = Array.isArray(raiz.hashtags)
    ? raiz.hashtags
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`))
    : []

  // Las busquedas de foto las decide quien escribe el carrusel: es el unico
  // que sabe de que va cada lamina. Antes salian de las palabras del titular,
  // y eso daba montañas para una noticia de cannabis o un puesto de fruta para
  // una de leche, porque el titular casi nunca nombra lo que hay que fotografiar.
  const fotos = Array.isArray(raiz.fotos)
    ? raiz.fotos
        .filter((f): f is string => typeof f === "string" && f.trim().length > 2)
        .map((f) => f.trim().toLowerCase())
        .slice(0, 8)
    : []

  const elemento =
    typeof raiz.elemento === "string" && raiz.elemento.trim().length > 2
      ? raiz.elemento.trim()
      : ""

  return { caption, hashtags, slides, fotos, elemento }
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
  nichos: string[] = [],
  /** Dibuja ademas la portada suelta que usa Facebook. */
  conPortadaFacebook = false
): Promise<CarouselPayload> {
  const { caption, hashtags, slides, fotos, elemento } = parseInstagramResponse(respuesta)

  // El cierre es una lamina de marca, no del guion: se añade aqui y no se le
  // pide al agente. Va siempre, porque la llamada a seguir la cuenta es lo
  // unico que convierte un carrusel en algo que deja audiencia detras, y
  // dejarla al criterio de cada generacion era garantizar que faltara. Si el
  // guion ya llega al tope de Instagram se recorta una lamina para hacerle
  // sitio, en vez de pasarse.
  if (slides.length >= MAX_SLIDES) slides.length = MAX_SLIDES - 1

  const variantes = repartirVariantes(slides, estilo.usarFotos && pexelsConfigurado())
  slides.push({
    n: slides.length + 1,
    type: "text",
    title: estilo.cierre.titulo,
    body: estilo.cierre.texto,
  })
  variantes.push("cierre")

  // El logo y la captura se descargan una vez: Satori necesita los bytes, no
  // una URL. La captura solo si el cierre la va a usar.
  const logo = await descargarFoto(estilo.logo)
  const perfil =
    estilo.cierre.estilo === "perfil" ? await descargarFoto(estilo.perfil) : null

  // El elemento de la portada: la cosa concreta de la que habla la noticia,
  // buscada en internet y no en el banco de fotos. Es opcional de verdad: si no
  // aparece nada utilizable la portada sale como siempre, sin hueco raro.
  const inserto = await buscarInserto(elemento)
  const insertoPos = Math.floor(Math.random() * 4)
  // La forma tambien se sortea: dos formas evitan que una serie de posts se lea
  // como una plantilla, y las dos funcionan igual de bien.
  const insertoForma = Math.random() < 0.5 ? "circulo" : "cuadrado"
  const conFoto = necesitanFoto(variantes)

  // Lo que pidio el agente manda; el rastreo del titular queda de respaldo por
  // si la respuesta viene sin busquedas.
  const terminos =
    fotos.length > 0 ? fotos : terminosDeBusqueda(news, nichos, estilo.fotosLiterales)
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
        {
          slide,
          variante: variantes[indice],
          foto,
          etiqueta,
          logo,
          inserto: indice === 0 ? inserto : null,
          insertoPos,
          insertoForma,
          perfil,
        },
        slides.length,
        estilo
      )
    )
  }

  const images = await subirCarrusel(pieceKey, imagenes)

  // La de Facebook se dibuja aparte y con la misma foto: total 1 y sin
  // paginacion, que es lo que quita el "1 / 6" y el "desliza".
  let portadaFacebook: string | undefined
  if (conPortadaFacebook && slides[0]) {
    const png = await renderSlide(
      { slide: slides[0], variante: variantes[0], foto: fotoPortada, etiqueta },
      1,
      { ...estilo, mostrarPaginacion: false }
    )
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", png)
  }

  return {
    caption,
    hashtags,
    images,
    ...(portadaFacebook ? { portadaFacebook } : {}),
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


/**
 * El elemento recortado de la portada, ya descargado.
 *
 * Se piden varias candidatas y se prueban en orden: la primera que se pueda
 * descargar de verdad gana. Muchas imagenes de resultados vienen de sitios que
 * bloquean la descarga directa o sirven HTML en vez de la imagen, asi que
 * quedarse con la primera sin comprobarla dejaria la portada sin elemento la
 * mitad de las veces.
 */
async function buscarInserto(consulta: string): Promise<string | null> {
  if (!consulta) return null

  try {
    const { searchImage } = await import("../serper")
    const candidatas = await searchImage(consulta)

    for (const imagen of candidatas.slice(0, 5)) {
      const descargada = await descargarFoto(imagen.url)
      if (descargada) return descargada
    }
  } catch {
    // Una busqueda caida no puede tumbar el carrusel: es un adorno, no el post.
  }

  return null
}
