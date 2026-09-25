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
