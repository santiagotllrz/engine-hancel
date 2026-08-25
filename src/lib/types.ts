/** Fila de `public.raw_news`, tal cual la devuelve Postgres. */
export type RawNews = {
  id: string
  niche: string
  tema: string
  title: string
  link: string
  snippet: string | null
  date_serper: string | null
  source: string | null
  image_url: string | null
  status: string
  relevance_score: number | null
  keywords_matched: string[] | null
  analysis_notes: string | null
  query_used: string | null
  created_at: string
  analyzed_at: string | null
  full_content: string | null
  content_fetched_at: string | null
  content_fetch_status: string | null
}

/** Fila de `public.pipeline_runs`. */
export type PipelineRun = {
  id: string
  run_type: string
  status: string
  started_at: string
  ended_at: string | null
  raw_inserted: number | null
  duplicates_removed: number | null
  error_message: string | null
}
