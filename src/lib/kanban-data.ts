import "server-only"

import type { ContentAngle, ContentPiece, PiecePayload } from "@/engine/content/types"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import type { RawNews } from "@/lib/types"

/**
 * El tablero: un hecho y todo lo que fue siendo.
 *
 * La unidad es la noticia, no la pieza. Una noticia produce un angulo y de ese
 * angulo salen uno o varios posts, y todo eso es la misma historia: por eso la
 * ficha lleva las etapas en pestañas en vez de repartirse en tarjetas sueltas
 * que no se saben hermanas.
 *
 * La columna sale del punto mas avanzado al que llego el hecho, no de un campo
 * de estado: asi no hay dos verdades que puedan discrepar.
 */

export type Columna = "noticias" | "contenido" | "publicado" | "descartados"

export type PiezaDelTablero = {
  id: string
  network: string
  status: string
  payload: PiecePayload & { images?: string[]; caption?: string; image?: string | null }
  published_at: string | null
  linkedin_urn: string | null
  publish_error: string | null
  job_instagram_id: string | null
}

export type Ficha = {
  newsId: string
  columna: Columna
  titulo: string
  fuente: string | null
  link: string
  niche: string
  tema: string
  snippet: string | null
  creada: string
  fechaSerper: string | null

  /** Analisis: `analizada` en false significa que aun esta en cola. */
  analizada: boolean
  score: number | null
  notas: string | null
  keywords: string[] | null
  contenido: string | null
  estadoContenido: string | null

  angulo: Pick<ContentAngle, "id" | "angle" | "thesis" | "playbook_format" | "status"> | null
  piezas: PiezaDelTablero[]
}

export type Tablero = Record<Columna, Ficha[]>

/** Lo que cabe en pantalla sin volverse lento; lo viejo se ve en /noticias. */
const TOPE = 300

function columnaDe(
  angulo: Ficha["angulo"],
  piezas: PiezaDelTablero[]
): Columna {
  if (piezas.some((p) => p.status === "published")) return "publicado"
  // Descartado es solo lo que alguien rechazo a mano: si hay piezas y todas
  // estan rechazadas, el hecho murio ahi. Lo que no llega por score nunca
  // genera nada, asi que no aparece por aqui.
  if (piezas.length > 0 && piezas.every((p) => p.status === "rejected")) return "descartados"
  if (angulo?.status === "discarded" && piezas.length === 0) return "descartados"
  if (angulo || piezas.length > 0) return "contenido"
  return "noticias"
}

export async function getTablero(): Promise<Tablero> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  // Lo descartado por fecha no entra al tablero: es ruido de la ingesta, no una
  // etapa del proceso. Sigue estando en /noticias con su estado.
  const { data: noticias, error } = await supabase
    .from("raw_news")
    .select("*")
    .eq("account_id", accountId)
    .neq("status", "discarded_date")
    .order("created_at", { ascending: false })
    .limit(TOPE)

  if (error) throw new Error(`No se pudo cargar el tablero: ${error.message}`)
  const filas = (noticias ?? []) as RawNews[]
  if (filas.length === 0) {
    return { noticias: [], contenido: [], publicado: [], descartados: [] }
  }

  const ids = filas.map((n) => n.id)
  const [angulos, piezas] = await Promise.all([
    supabase.from("content_angles").select("*").in("raw_news_id", ids),
    supabase.from("content_pieces").select("*").in("raw_news_id", ids),
  ])

  const angulosPorNoticia = new Map<string, ContentAngle>()
  for (const a of (angulos.data ?? []) as ContentAngle[]) {
    // Si hubiera varios, manda el primero: es el que alimenta las piezas.
    if (!angulosPorNoticia.has(a.raw_news_id)) angulosPorNoticia.set(a.raw_news_id, a)
  }

  const piezasPorNoticia = new Map<string, PiezaDelTablero[]>()
  for (const p of (piezas.data ?? []) as (ContentPiece & {
    published_at: string | null
    linkedin_urn: string | null
    publish_error: string | null
    job_instagram_id: string | null
  })[]) {
    if (!p.raw_news_id) continue
    const lista = piezasPorNoticia.get(p.raw_news_id) ?? []
    lista.push({
      id: p.id,
      network: p.network,
      status: p.status,
      payload: (p.payload ?? {}) as PiezaDelTablero["payload"],
      published_at: p.published_at,
      linkedin_urn: p.linkedin_urn,
      publish_error: p.publish_error,
      job_instagram_id: p.job_instagram_id,
    })
    piezasPorNoticia.set(p.raw_news_id, lista)
  }

  const tablero: Tablero = { noticias: [], contenido: [], publicado: [], descartados: [] }

  for (const n of filas) {
    const a = angulosPorNoticia.get(n.id) ?? null
    const angulo = a
      ? { id: a.id, angle: a.angle, thesis: a.thesis, playbook_format: a.playbook_format, status: a.status }
      : null
    const misPiezas = piezasPorNoticia.get(n.id) ?? []

    const ficha: Ficha = {
      newsId: n.id,
      columna: columnaDe(angulo, misPiezas),
      titulo: n.title,
      fuente: n.source,
      link: n.link,
      niche: n.niche,
      tema: n.tema,
      snippet: n.snippet,
      creada: n.created_at,
      fechaSerper: n.date_serper,
      analizada: n.status === "analyzed",
      score: n.relevance_score,
      notas: n.analysis_notes,
      keywords: n.keywords_matched,
      contenido: n.full_content,
      estadoContenido: n.content_fetch_status,
      angulo,
      piezas: misPiezas,
    }

    tablero[ficha.columna].push(ficha)
  }

  return tablero
}
