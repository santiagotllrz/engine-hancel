import { SIMILARITY_THRESHOLD } from "./config"

/** Lo minimo que necesita el deduplicador de cada fila ya guardada. */
export type DedupeCandidate = {
  id: string
  title: string | null
  niche: string | null
}

/**
 * Normaliza un titulo a un conjunto de palabras comparable.
 *
 * Porteado literal del nodo "Detectar duplicados" de n8n: minusculas, todo lo
 * que no sea [a-z0-9 ] pasa a espacio, se descartan palabras de 4 letras o
 * menos y el resto se ordena alfabeticamente. Ordenar hace la comparacion
 * insensible al orden de las palabras, que es justo lo que distingue dos
 * titulares del mismo hecho.
 *
 * Ojo: al filtrar `[^a-z0-9 ]` despues de `toLowerCase()`, los acentos se
 * convierten en espacios y parten la palabra. Se mantiene asi para no cambiar
 * que se considera duplicado respecto del flujo actual.
 */
export function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((word) => word.length > 3)
    .sort()
    .join(" ")
}

/**
 * Dos titulos son "el mismo hecho" si su indice de Jaccard supera el umbral.
 *
 * Exige al menos 2 palabras utiles en cada lado: con una sola palabra en comun
 * el indice se dispara y cualquier par pareceria duplicado.
 */
export function isSimilar(a: string | null, b: string | null): boolean {
  const normalizedA = normalizeTitle(a)
  const normalizedB = normalizeTitle(b)
  if (!normalizedA || !normalizedB) return false

  const wordsA = new Set(normalizedA.split(" ").filter(Boolean))
  const wordsB = new Set(normalizedB.split(" ").filter(Boolean))
  if (wordsA.size < 2 || wordsB.size < 2) return false

  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length
  const union = new Set([...wordsA, ...wordsB]).size

  return union > 0 && intersection / union > SIMILARITY_THRESHOLD
}

/**
 * Devuelve los ids a eliminar por hablar del mismo hecho que una fila anterior.
 *
 * La comparacion es dentro de cada nicho, nunca entre nichos: la misma noticia
 * indexada bajo "AI" y bajo "VC" son dos angulos distintos y ambas se
 * conservan. Se respeta el orden recibido (en la ingesta, `created_at` asc), de
 * modo que sobrevive la primera aparicion.
 */
export function findDuplicateIds(rows: DedupeCandidate[]): string[] {
  const byNiche = new Map<string, DedupeCandidate[]>()
  for (const row of rows) {
    const key = row.niche || "x"
    const group = byNiche.get(key)
    if (group) group.push(row)
    else byNiche.set(key, [row])
  }

  const duplicates: string[] = []
  for (const group of byNiche.values()) {
    const kept: DedupeCandidate[] = []
    for (const row of group) {
      if (kept.some((seen) => isSimilar(seen.title, row.title))) {
        duplicates.push(row.id)
      } else {
        kept.push(row)
      }
    }
  }

  return duplicates
}
