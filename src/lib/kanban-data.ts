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
 * Las etapas son seis y se agrupan de cuatro en la interfaz: "Noticias" junta
 * traidas y analizadas, "Contenido" junta angulo y post. El grupo dice en que
 * fase del proceso esta; la etapa, en que punto exacto dentro de esa fase.
 *
 * La etapa sale del punto mas avanzado al que llego el hecho, no de un campo de
 * estado: asi no hay dos verdades que puedan discrepar.
 */

export type Etapa =
  | "sin_analizar"
  | "analizada"
  | "angulo"
  | "post"
  | "publicado"
  | "descartado"
  | "descartado_fecha"
  | "repetida"

export type PiezaDelTablero = {
  id: string
  network: string
  status: string
  payload: PiecePayload & { images?: string[]; caption?: string; image?: string | null }
  published_at: string | null
  linkedin_urn: string | null
  publish_error: string | null
}

export type Ficha = {
  newsId: string
  etapa: Etapa
  titulo: string
  fuente: string | null
  link: string
  niche: string
  tema: string
  snippet: string | null
  creada: string
  fechaSerper: string | null

  analizada: boolean
  score: number | null
  notas: string | null
  keywords: string[] | null
  contenido: string | null
  estadoContenido: string | null

  angulo: Pick<ContentAngle, "id" | "angle" | "thesis" | "playbook_format" | "status"> | null
  piezas: PiezaDelTablero[]

  /** La primera imagen ya generada, para verla en la tarjeta sin abrirla. */
  miniatura: string | null

  /** La empujo alguien a mano en vez de la seleccion automatica. */
  promovidaAMano: boolean
  /**
   * Se genero pese a no llegar al umbral. Es la discrepancia entre lo que
   * dijo el analisis y lo que decidio una persona, y por eso se enseña.
   */
  bajoUmbral: boolean
}

export type Tablero = {
  /** Las tarjetas que se pintan: un trozo de cada etapa, no todo. */
  fichas: Record<Etapa, Ficha[]>
  /** Cuantas hay de verdad en cada etapa, aunque no se pinten todas. */
  conteos: Record<Etapa, number>
}

/**
 * Cuantas tarjetas se pintan por etapa.
 *
 * El conteo se calcula sobre todo, no sobre esto: antes el tope recortaba la
 * consulta y las cifras de las columnas mentian —decian 265 donde habia 349—
 * porque contaban solo lo cargado.
 */
const VISIBLES = 60

/** Freno de seguridad para que una cuenta enorme no traiga la tabla entera. */
const MAX_FILAS = 3000

function etapaDe(
  estadoNoticia: string,
  analizada: boolean,
  angulo: Ficha["angulo"],
  piezas: PiezaDelTablero[]
): Etapa {
  // El hecho ya era viejo al llegar: no se analiza ni se genera nada con el.
  if (estadoNoticia === "discarded_date") return "descartado_fecha"
  // Ese hecho ya lo conto otra: no genera nada y no vuelve a la cola.
  if (estadoNoticia === "duplicate") return "repetida"
  if (piezas.some((p) => p.status === "published")) return "publicado"
  // Descartado es solo lo rechazado a mano: lo que no llega por score nunca
  // genera nada, asi que por aqui no aparece.
  if (piezas.length > 0 && piezas.every((p) => p.status === "rejected")) return "descartado"
  if (piezas.length > 0) return "post"
  if (angulo) return angulo.status === "discarded" ? "descartado" : "angulo"
  return analizada ? "analizada" : "sin_analizar"
}

/**
 * La imagen que representa al hecho.
 *
 * Instagram guarda todas las laminas y vale la portada; Facebook guarda la suya
 * en el payload. LinkedIn no tiene: su tarjeta se dibuja al publicar, asi que
 * antes de salir no hay nada que enseñar y se cae a la de las otras redes si el
 * mismo angulo las produjo.
 */
function miniaturaDe(piezas: PiezaDelTablero[]): string | null {
  const ig = piezas.find((p) => p.network === "instagram")
  const portada = ig?.payload.images?.[0]
  if (portada) return portada

  const fb = piezas.find((p) => p.network === "facebook")
  return fb?.payload.image ?? null
}

export async function getTablero(): Promise<Tablero> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  // Lo descartado por fecha tambien entra: es un final del recorrido, no ruido
  // que esconder. Dejarlo fuera hacia que el tablero no sumara lo que hay.
  const { data: noticias, error } = await supabase
    .from("raw_news")
    .select(
      "id, title, source, link, niche, tema, status, relevance_score, created_at, date_serper, snippet, analysis_notes, keywords_matched, content_fetch_status, promoted_by_hand, promoted_score, promoted_threshold"
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(MAX_FILAS)

  if (error) throw new Error(`No se pudo cargar el tablero: ${error.message}`)
  const filas = (noticias ?? []) as unknown as RawNews[]

  const porEtapa: Record<Etapa, Ficha[]> = {
    sin_analizar: [],
    analizada: [],
    angulo: [],
    post: [],
    publicado: [],
    descartado: [],
    descartado_fecha: [],
    repetida: [],
  }
  if (filas.length === 0) {
    return { fichas: porEtapa, conteos: { ...CONTEOS_VACIOS } }
  }

  // Se filtra por cuenta, no por la lista de ids: meter cientos de uuid en un
  // `in()` hace una URL de decenas de kB que PostgREST rechaza, y el fallo era
  // mudo —las piezas no llegaban y todo parecia estar en "analizada"—. Ademas
  // las dos tablas ya llevan `account_id`, asi que el filtro es el mismo.
  const [angulos, piezas] = await Promise.all([
    supabase.from("content_angles").select("*").eq("account_id", accountId),
    supabase.from("content_pieces").select("*").eq("account_id", accountId),
  ])

  if (angulos.error) throw new Error(`No se pudieron leer los angulos: ${angulos.error.message}`)
  if (piezas.error) throw new Error(`No se pudieron leer las piezas: ${piezas.error.message}`)

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
    })
    piezasPorNoticia.set(p.raw_news_id, lista)
  }


  for (const n of filas) {
    const a = angulosPorNoticia.get(n.id) ?? null
    const angulo = a
      ? {
          id: a.id,
          angle: a.angle,
          thesis: a.thesis,
          playbook_format: a.playbook_format,
          status: a.status,
        }
      : null
    const misPiezas = piezasPorNoticia.get(n.id) ?? []
    const analizada = n.status === "analyzed"

    const ficha: Ficha = {
      newsId: n.id,
      etapa: etapaDe(n.status, analizada, angulo, misPiezas),
      titulo: n.title,
      fuente: n.source,
      link: n.link,
      niche: n.niche,
      tema: n.tema,
      snippet: n.snippet,
      creada: n.created_at,
      fechaSerper: n.date_serper,
      analizada,
      score: n.relevance_score,
      notas: n.analysis_notes,
      keywords: n.keywords_matched,
      contenido: null,
      estadoContenido: n.content_fetch_status,
      angulo,
      piezas: misPiezas,
      miniatura: miniaturaDe(misPiezas),
      promovidaAMano: n.promoted_by_hand === true,
      bajoUmbral:
        n.promoted_by_hand === true &&
        n.promoted_score !== null &&
        n.promoted_threshold !== null &&
        n.promoted_score < n.promoted_threshold,
    }

    porEtapa[ficha.etapa].push(ficha)
  }

  // Los conteos salen de todo lo recorrido; las tarjetas, de un trozo.
  const conteos = { ...CONTEOS_VACIOS }
  const fichas = { ...porEtapa }
  for (const etapa of Object.keys(porEtapa) as Etapa[]) {
    conteos[etapa] = porEtapa[etapa].length
    fichas[etapa] = porEtapa[etapa].slice(0, VISIBLES)
  }

  return { fichas, conteos }
}

const CONTEOS_VACIOS: Record<Etapa, number> = {
  sin_analizar: 0,
  analizada: 0,
  angulo: 0,
  post: 0,
  publicado: 0,
  descartado: 0,
  descartado_fecha: 0,
  repetida: 0,
}
