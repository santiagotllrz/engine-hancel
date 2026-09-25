import { supabaseAdmin } from "./supabase-admin"
import { FRESHNESS, RESULTS_PER_SEARCH, type SearchSpec } from "./config"

const SERPER_NEWS_URL = "https://google.serper.dev/news"

/** Forma de cada resultado en la respuesta de Serper News. */
export type SerperNewsItem = {
  title?: string
  link?: string
  snippet?: string
  date?: string
  source?: string
  imageUrl?: string
}

/**
 * La clave de Serper.
 *
 * Primero la que este guardada en la aplicacion, que es donde se cambia sin
 * redesplegar; el entorno queda de respaldo para no dejar la ingesta muerta en
 * una instalacion que aun no la haya pegado.
 */
async function apiKey(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("serper_api_key")
    .eq("id", true)
    .maybeSingle()

  const guardada = (data as { serper_api_key: string | null } | null)?.serper_api_key?.trim()
  const key = guardada || process.env.SERPER_API_KEY
  if (!key) {
    throw new Error("Falta la clave de Serper. Ponla en Configuracion, en Conexiones.")
  }
  return key
}

/**
 * Ejecuta una busqueda de noticias en Serper.
 *
 * Lanza si la respuesta no es 2xx: quien orquesta decide si una busqueda caida
 * tumba la corrida entera o solo se salta (ver `ingest.ts`, que las aisla).
 */
export async function searchNews(
  spec: SearchSpec,
  signal?: AbortSignal
): Promise<SerperNewsItem[]> {
  const response = await fetch(SERPER_NEWS_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": await apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: spec.q,
      num: spec.num ?? RESULTS_PER_SEARCH,
      tbs: spec.freshness ?? FRESHNESS,
      hl: spec.hl,
      gl: spec.gl,
    }),
    signal,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      `Serper respondio ${response.status} para "${spec.q}": ${detail.slice(0, 300)}`
    )
  }

  const payload = (await response.json()) as { news?: SerperNewsItem[] }
  return payload.news ?? []
}

// ------------------------------------------------------------------ imagenes

const SERPER_IMAGES_URL = "https://google.serper.dev/images"

export type ImagenEncontrada = {
  url: string
  ancho: number
  alto: number
  titulo: string
}

/**
 * Busca una imagen concreta: un logo, un producto, una persona, un objeto.
 *
 * Pexels no vale para esto. Es un banco de fotos de stock: sabe de "cafetal" y
 * de "vacas", pero no de "logo de Fedegan" ni de "Decreto 1138", y ante una
 * busqueda que no entiende devuelve algo bonito y ajeno. Aqui hace falta lo
 * contrario, la cosa exacta de la que habla la noticia.
 *
 * Por eso Google, a traves de Serper, que ya esta pagado y configurado para la
 * ingesta. Se piden varias y se filtra: las muy pequeñas se ven rotas al
 * ampliarlas y las muy apaisadas no encajan en un circulo.
 */
export async function searchImage(
  consulta: string,
  signal?: AbortSignal
): Promise<ImagenEncontrada[]> {
  const response = await fetch(SERPER_IMAGES_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": await apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: consulta, num: 10 }),
    signal: signal ?? AbortSignal.timeout(15_000),
  })

  if (!response.ok) return []

  const datos = (await response.json().catch(() => null)) as {
    images?: { imageUrl?: string; imageWidth?: number; imageHeight?: number; title?: string }[]
  } | null

  return (datos?.images ?? [])
    .map((i) => ({
      url: i.imageUrl ?? "",
      ancho: i.imageWidth ?? 0,
      alto: i.imageHeight ?? 0,
      titulo: i.title ?? "",
    }))
    .filter((i) => {
      if (!/^https?:\/\//.test(i.url)) return false
      // El SVG se descarta: Satori solo dibuja mapas de bits.
      if (/\.svg($|\?)/i.test(i.url)) return false
      if (i.ancho < 200 || i.alto < 200) return false
      // Dentro de un circulo, algo mas ancho que 2:1 se recorta hasta no
      // reconocerse. Se prefiere lo cuadrado.
      const proporcion = i.ancho / i.alto
      return proporcion > 0.45 && proporcion < 2.2
    })
}
