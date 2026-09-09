/**
 * Tipos de la etapa 2: de una noticia analizada a una pieza de LinkedIn.
 *
 * Dos clases de tabla, separadas a proposito:
 *   jobs_*      buzones. El mecanismo de ejecucion de las rutinas de Claude.
 *   content_*   el resultado limpio que consume la interfaz.
 * Si algun dia se cambia de rutinas a la API directa, solo cambian los buzones.
 */

/** Estados de un buzon. Los escribe la rutina externa, salvo el inicial. */
export type JobStatus = "pending" | "processing" | "done" | "failed"

/** Fila de `public.jobs_angle`, tal cual la devuelve Postgres. */
export type JobAngle = {
  id: string
  raw_news_id: string
  input: AngleJobInput
  status: JobStatus
  respuesta: unknown
  error: string | null
  created_at: string
  processed_at: string | null
  /** Lo escribe SOLO la app, al materializar la respuesta. Ver `jobs.ts`. */
  consumed_at: string | null
}

/** Fila de `public.jobs_linkedin`. */
export type JobLinkedin = {
  id: string
  content_angle_id: string
  input: LinkedinJobInput
  status: JobStatus
  respuesta: unknown
  error: string | null
  created_at: string
  processed_at: string | null
  consumed_at: string | null
}

export type AngleStatus = "angled" | "pending_generation" | "generated" | "discarded"

/** Fila de `public.content_angles`. */
export type ContentAngle = {
  id: string
  raw_news_id: string
  job_angle_id: string | null
  angle: string
  thesis: string | null
  playbook_format: string | null
  status: AngleStatus
  position: number
  created_at: string
}

export type PieceStatus = "generated" | "approved" | "rejected"

/** Fila de `public.content_pieces`. */
export type ContentPiece = {
  id: string
  content_angle_id: string
  raw_news_id: string | null
  job_linkedin_id: string | null
  network: string
  payload: PiecePayload
  status: PieceStatus
  variables_usadas: Variables | null
  override_puntual: Partial<Variables> | null
  created_at: string
  generated_at: string | null
  approved_at: string | null
}

/**
 * Las ranuras de personalizacion.
 *
 * NO son texto libre que se le pasa al modelo como instruccion: son valores
 * acotados que rellenan huecos que el prompt base de la rutina dejo abiertos.
 * El prompt base no vive aqui, vive en la rutina.
 */
export type Variables = {
  tono: string
  audiencia: string
  voz_marca: string
  cta: string
  evitar: string
  longitud: string
  idioma: string
}

/** Fila de `public.generation_config`. Tabla de una sola fila. */
export type GenerationConfig = {
  variables: Variables
  /** NULL mientras el usuario no defina el scoring desde la interfaz. */
  score_threshold: number | null
  generation_mode: "auto" | "manual"
  updated_at: string
}

// ------------------------------------------------------ contrato con la rutina
//
// Lo unico de todo esto que el codigo NO controla. La forma de `input` la
// escribe la app y la rutina la lee; la de `respuesta` es al reves. Si el prompt
// de la rutina cambia de forma, `parse.ts` lo detecta y marca el job 'failed'
// con el motivo, en vez de meter filas basura en las tablas limpias.

/** Lo que la app deja en `jobs_angle.input` para que la rutina lo lea. */
export type AngleJobInput = {
  raw_news: {
    id: string
    title: string
    link: string
    source: string | null
    snippet: string | null
    full_content: string | null
    niche: string
    tema: string
    relevance_score: number | null
    keywords_matched: string[] | null
    /** El angulo sugerido por la etapa 1: insumo que esta rutina refina. */
    analysis_notes: string | null
  }
  variables: Variables
}

/** Lo que la app deja en `jobs_linkedin.input`. */
export type LinkedinJobInput = {
  angle: {
    id: string
    angle: string
    thesis: string | null
    playbook_format: string | null
  }
  raw_news: AngleJobInput["raw_news"]
  variables: Variables
}

/** Un angulo dentro de `jobs_angle.respuesta`. Cuantos vengan lo decide la rutina. */
export type AnglePayload = {
  angle: string
  thesis: string | null
  playbook_format: string | null
}

/** El post dentro de `jobs_linkedin.respuesta`. */
export type PiecePayload = {
  hook: string | null
  body: string
  hashtags: string[]
  cta: string | null
  notas: string | null
}
