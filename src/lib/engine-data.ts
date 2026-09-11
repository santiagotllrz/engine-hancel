import "server-only"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import type { Routine } from "@/engine/routines"
import { getTaxonomy, type CategoryWithSegments } from "@/engine/taxonomy"

export type { CategoryWithSegments }
export { getTaxonomy }

/** Rutina tal como se muestra en la UI: el token nunca sale entero. */
export type RoutineView = Omit<Routine, "token"> & {
  hasToken: boolean
  tokenHint: string | null
}

function maskToken(token: string | null): { hasToken: boolean; tokenHint: string | null } {
  if (!token) return { hasToken: false, tokenHint: null }
  const tail = token.slice(-4)
  return { hasToken: true, tokenHint: `••••${tail}` }
}

export async function getRoutines(): Promise<RoutineView[]> {
  const { data, error } = await supabaseAdmin()
    .from("engine_routines")
    .select("*")
    .order("created_at")

  if (error) throw new Error(`No se pudieron cargar las rutinas: ${error.message}`)

  return ((data ?? []) as Routine[]).map(({ token, ...rest }) => ({
    ...rest,
    ...maskToken(token),
  }))
}

export type PipelineEvent = {
  id: number
  run_id: string | null
  at: string
  kind: string
  label: string | null
  detail: Record<string, unknown> | null
}

/** Ultimos eventos de todas las corridas, para el feed de actividad. */
export async function getRecentEvents(limit = 60): Promise<PipelineEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("pipeline_events")
    .select("*")
    // Los de la cuenta, mas los del motor. Un evento sin cuenta es de la pasada
    // entera —"revision de la cola"— y no pertenece a ninguna en concreto.
    .or(`account_id.eq.${await idDeCuentaActual()},account_id.is.null`)
    .order("at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  return (data ?? []) as PipelineEvent[]
}

export type GraphNode = {
  id: string
  kind: "category" | "segment" | "news"
  label: string
  color: string
  /** Peso relativo, usado para el radio del nodo. */
  weight: number
  parent: string | null
  meta?: Record<string, string | number | null>
}

export type GraphData = {
  nodes: GraphNode[]
  links: { source: string; target: string }[]
  counts: { categories: number; segments: number; news: number }
}

/**
 * Grafo categoria -> segmento -> noticia con datos reales.
 *
 * Se limita a las noticias mas recientes: con las 86 filas actuales cabe todo,
 * pero el layout se vuelve ilegible pasadas unas cuantas centenas de nodos.
 */
export async function getGraphData(newsLimit = 160): Promise<GraphData> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()
  const [taxonomy, news] = await Promise.all([
    getTaxonomy(accountId),
    supabase
      .from("raw_news")
      .select("id, title, niche, tema, status, relevance_score, full_content")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(newsLimit),
  ])

  if (news.error) {
    throw new Error(`No se pudieron cargar las noticias del grafo: ${news.error.message}`)
  }

  const nodes: GraphNode[] = []
  const links: { source: string; target: string }[] = []

  const colorByNiche = new Map<string, string>()
  /** Un segmento se localiza por (niche, tema), que es como quedan en raw_news. */
  const segmentKey = (niche: string, label: string) => `seg:${niche}::${label}`

  for (const category of taxonomy) {
    colorByNiche.set(category.slug, category.color)
    nodes.push({
      id: `cat:${category.id}`,
      kind: "category",
      label: category.name,
      color: category.color,
      weight: 3,
      parent: null,
      meta: { slug: category.slug, activa: category.is_active ? "si" : "no" },
    })

    for (const segment of category.segments) {
      const id = segmentKey(category.slug, segment.label)
      nodes.push({
        id,
        kind: "segment",
        label: segment.label,
        color: category.color,
        weight: 2,
        parent: `cat:${category.id}`,
        meta: { query: segment.query, activo: segment.is_active ? "si" : "no" },
      })
      links.push({ source: `cat:${category.id}`, target: id })
    }
  }

  const knownSegments = new Set(nodes.filter((n) => n.kind === "segment").map((n) => n.id))

  type NewsRow = {
    id: string
    title: string
    niche: string
    tema: string
    status: string
    relevance_score: number | null
    full_content: string | null
  }

  for (const row of (news.data ?? []) as NewsRow[]) {
    const parent = segmentKey(row.niche, row.tema)
    // Una noticia cuyo segmento ya se borro de la taxonomia queda huerfana; se
    // omite en vez de inventar un nodo que no corresponde a la config actual.
    if (!knownSegments.has(parent)) continue

    nodes.push({
      id: `news:${row.id}`,
      kind: "news",
      label: row.title,
      color: colorByNiche.get(row.niche) ?? "#8b8b8b",
      weight: row.full_content ? 1.4 : 1,
      parent,
      meta: {
        estado: row.status,
        relevancia: row.relevance_score,
        contenido: row.full_content ? "si" : "no",
      },
    })
    links.push({ source: parent, target: `news:${row.id}` })
  }

  return {
    nodes,
    links,
    counts: {
      categories: nodes.filter((n) => n.kind === "category").length,
      segments: nodes.filter((n) => n.kind === "segment").length,
      news: nodes.filter((n) => n.kind === "news").length,
    },
  }
}

/**
 * Cuantas noticias tiene guardadas cada segmento.
 *
 * La red del motor dibuja el corpus real en reposo, no un lienzo vacio: sin
 * esto la vista solo tendria algo que mostrar mientras corre una ingesta.
 */
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
