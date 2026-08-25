import { INITIAL_STATUS, type SearchSpec } from "./config"
import type { SerperNewsItem } from "./serper"

/** Columnas que escribe la ingesta al insertar en `raw_news`. */
export type RawNewsInsert = {
  niche: string
  tema: string
  title: string
  link: string
  snippet: string
  date_serper: string
  source: string
  image_url: string
  query_used: string
  status: string
}

/**
 * Convierte los resultados crudos de Serper en filas de `raw_news`.
 *
 * Descarta lo que no tenga link y titulo, igual que hacian los nodos "Split"
 * de n8n: sin link no hay clave para deduplicar ni articulo que analizar.
 */
export function toRows(
  spec: SearchSpec,
  items: SerperNewsItem[]
): RawNewsInsert[] {
  return items
    .map((item) => ({
      niche: spec.niche,
      tema: spec.label,
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
      date_serper: item.date ?? "",
      source: item.source ?? "",
      image_url: item.imageUrl ?? "",
      query_used: spec.label,
      status: INITIAL_STATUS,
    }))
    .filter((row) => row.link && row.title)
}

/**
 * Colapsa filas con el mismo `link` dentro de una misma corrida.
 *
 * La restriccion UNIQUE de `raw_news.link` ya lo impediria en la base, pero
 * varias busquedas suelen devolver la misma noticia y mandarla una sola vez
 * hace el INSERT mas pequeno y el conteo de insertadas mas facil de leer.
 * Gana la primera aparicion, que es el orden en que estan definidas las
 * busquedas.
 */
export function dedupeByLink(rows: RawNewsInsert[]): RawNewsInsert[] {
  const seen = new Set<string>()
  const unique: RawNewsInsert[] = []

  for (const row of rows) {
    if (seen.has(row.link)) continue
    seen.add(row.link)
    unique.push(row)
  }

  return unique
}
