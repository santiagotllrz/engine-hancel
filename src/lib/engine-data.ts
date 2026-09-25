import "server-only"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { getTaxonomy, type CategoryWithSegments } from "@/engine/taxonomy"

export type { CategoryWithSegments }
export { getTaxonomy }

/** Cuantas noticias hay por segmento de la taxonomia. */
export async function getSegmentCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("niche, tema")
    .eq("account_id", await idDeCuentaActual())
  if (error) throw new Error(`No se pudieron contar las noticias: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { niche: string | null; tema: string | null }[]) {
    if (!row.niche || !row.tema) continue
    const key = `${row.niche} · ${row.tema}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
