import { expirarPendientesViejas, fireAnalysisRoutine } from "./analysis-routine"
import { DEDUPE_FETCH_LIMIT, type SearchSpec } from "./config"
import { findDuplicateIds, type DedupeCandidate } from "./dedupe"
import { EventRecorder, type EventSink } from "./events"
import { dedupeByLink, toRows, type RawNewsInsert } from "./normalize"
import type { RoutineCallResult } from "./routines"
import { searchNews } from "./serper"
import { supabaseAdmin } from "./supabase-admin"
import { getActiveSearches } from "./taxonomy"

export type SearchOutcome = {
  niche: string
  label: string
  /** Resultados devueltos por Serper tras filtrar los que no tienen link/titulo. */
  found: number
  error?: string
}

export type IngestionSummary = {
  runId: string | null
  startedAt: string
  endedAt: string
  durationMs: number
  searches: SearchOutcome[]
  /** Filas candidatas tras unir las busquedas y colapsar links repetidos. */
  candidates: number
  /** Filas realmente nuevas en la base (las repetidas las ignora el UNIQUE). */
  inserted: number
  /** Filas borradas por hablar del mismo hecho que otra del mismo dia. */
  duplicatesRemoved: number
  failedSearches: number
  /** Rutinas de analisis invocadas al terminar. */
  routines: RoutineCallResult[]
}

export type DryRunSummary = {
  startedAt: string
  durationMs: number
  searches: SearchOutcome[]
  candidates: number
  wouldInsert: number
  alreadyKnown: number
  failedSearches: number
}

export type RunOptions = {
  /** La cuenta para la que se ingiere. Cada una tiene su taxonomia y su corpus. */
  accountId: string
  signal?: AbortSignal
  /** Recibe cada evento en el momento en que ocurre (vista en vivo). */
  onEvent?: EventSink
  /** Salta la llamada a las rutinas de analisis. */
  skipRoutines?: boolean
}

/** Inicio del dia UTC, igual que el `created_at=gte.` que usaba n8n. */
function startOfTodayUtc(now: Date): string {
  return `${now.toISOString().split("T")[0]}T00:00:00.000Z`
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Corre las busquedas en paralelo y las convierte en filas candidatas.
 *
 * Cada busqueda esta aislada: si una falla, las demas siguen y el error queda
 * anotado. Es el comportamiento que tenian las ramas independientes de n8n,
 * pero aqui la falla es visible en vez de silenciosa.
 */
async function collectCandidates(
  specs: SearchSpec[],
  recorder: EventRecorder,
  signal?: AbortSignal
): Promise<{ searches: SearchOutcome[]; candidates: RawNewsInsert[] }> {
  const results = await Promise.all(
    specs.map(async (spec) => {
      recorder.emit("search.started", `${spec.niche} · ${spec.label}`, { q: spec.q })
      try {
        const items = await searchNews(spec, signal)
        const rows = toRows(spec, items)
        recorder.emit("search.done", `${spec.niche} · ${spec.label}`, {
          found: rows.length,
          niche: spec.niche,
          titles: rows.slice(0, 5).map((row) => row.title),
        })
        return {
          outcome: { niche: spec.niche, label: spec.label, found: rows.length },
          rows,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recorder.emit("search.failed", `${spec.niche} · ${spec.label}`, { error: message })
        return {
          outcome: { niche: spec.niche, label: spec.label, found: 0, error: message },
          rows: [] as RawNewsInsert[],
        }
      }
    })
  )

  const candidates = dedupeByLink(results.flatMap((result) => result.rows))
  recorder.emit("harvest.done", `${candidates.length} candidatas tras unir busquedas`, {
    candidates: candidates.length,
  })

  return { searches: results.map((result) => result.outcome), candidates }
}

/**
 * Etapa 1 completa: abre la corrida, busca, inserta lo nuevo, elimina
 * duplicados del dia, dispara el analisis y cierra la corrida.
 */
export async function runIngestion(options: RunOptions): Promise<IngestionSummary> {
  const supabase = supabaseAdmin()
  const started = new Date()
  const accountId = options.accountId

  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .insert({ account_id: accountId, run_type: "research_engine", status: "running" })
    .select("id")
    .single()

  if (runError) throw new Error(`No se pudo abrir la corrida: ${runError.message}`)
  const runId = run.id as string

  const recorder = new EventRecorder(runId, options.onEvent, accountId)
  recorder.emit("run.started", "Corrida iniciada", { runId })

  try {
    const specs = await getActiveSearches(accountId)
    const { searches, candidates } = await collectCandidates(specs, recorder, options.signal)

    // `ignoreDuplicates` es un ON CONFLICT DO NOTHING sobre el UNIQUE de `link`,
    // equivalente al Prefer: resolution=ignore-duplicates de n8n. El .select()
    // devuelve solo las filas realmente insertadas, que es como contamos.
    let inserted = 0
    const insertedIds: string[] = []
    for (const batch of chunk(candidates, 500)) {
      const { data, error } = await supabase
        .from("raw_news")
        .upsert(
          batch.map((fila) => ({ ...fila, account_id: accountId })),
          { onConflict: "account_id,link", ignoreDuplicates: true }
        )
        .select("id")

      if (error) throw new Error(`Fallo al insertar noticias: ${error.message}`)
      inserted += data?.length ?? 0
      for (const row of data ?? []) insertedIds.push((row as { id: string }).id)
    }
    recorder.emit("insert.done", `${inserted} noticias nuevas guardadas`, { inserted })

    // Se mira el dia completo, no solo esta corrida: la corrida de la tarde debe
    // detectar que repite un hecho que ya trajo la de la manana.
    const { data: todayRows, error: fetchError } = await supabase
      .from("raw_news")
      .select("id, title, niche")
      .eq("account_id", accountId)
      .gte("created_at", startOfTodayUtc(started))
      .order("created_at", { ascending: true })
      .limit(DEDUPE_FETCH_LIMIT)

    if (fetchError) {
      throw new Error(`Fallo al leer las noticias de hoy: ${fetchError.message}`)
    }
    recorder.emit("dedupe.scanned", `${todayRows?.length ?? 0} noticias del dia revisadas`, {
      scanned: todayRows?.length ?? 0,
    })

    const duplicateIds = findDuplicateIds((todayRows ?? []) as DedupeCandidate[])

    let duplicatesRemoved = 0
    for (const batch of chunk(duplicateIds, 100)) {
      const { error } = await supabase.from("raw_news").delete().in("id", batch)
      if (error) throw new Error(`Fallo al borrar duplicados: ${error.message}`)
      duplicatesRemoved += batch.length
    }
    recorder.emit("dedupe.removed", `${duplicatesRemoved} duplicados eliminados`, {
      removed: duplicatesRemoved,
    })

    // --- Analisis inmediato ---
    // Las noticias ya estan en `pending_analysis`; se dispara la rutina para que
    // arranque sin esperar a nadie. Los ids borrados por duplicado se excluyen
    // del conteo para no anunciar trabajo que ya no existe.
    const removed = new Set(duplicateIds)
    const toAnalyze = insertedIds.filter((id) => !removed.has(id))
    const routines: RoutineCallResult[] = []

    // Lo que lleve dias esperando sale de la cola antes de avisar a la rutina:
    // analiza por orden de llegada, y si no, las recien llegadas esperarian
    // detras de prensa caducada.
    const caducadas = await expirarPendientesViejas(accountId)
    if (caducadas > 0) {
      recorder.emit("dedupe.removed", `${caducadas} pendientes caducadas sacadas de la cola`, {
        expired: caducadas,
      })
    }

    if (options.skipRoutines) {
      recorder.emit("routine.skipped", "Analisis omitido por configuracion de la corrida")
    } else if (toAnalyze.length === 0) {
      // Sin noticias nuevas el disparo solo gastaria una ejecucion de la rutina
      // para que no encuentre nada que analizar.
      recorder.emit("routine.skipped", "Sin noticias nuevas: no se dispara el analisis")
    } else {
      const result = await fireAnalysisRoutine(
        `Han llegado ${toAnalyze.length} noticias nuevas en la corrida ${runId}. ` +
          `Analizalas siguiendo las instrucciones de la rutina.`,
        options.signal
      )
      routines.push(result)

      if (result.ok) {
        recorder.emit("routine.called", "Rutina de analisis disparada", {
          count: toAnalyze.length,
          status: result.status,
        })
      } else {
        recorder.emit("routine.failed", "La rutina de analisis fallo", {
          error: result.error,
        })
      }
    }

    const ended = new Date()
    const { error: completeError } = await supabase
      .from("pipeline_runs")
      .update({
        ended_at: ended.toISOString(),
        status: "completed",
        raw_inserted: inserted,
        duplicates_removed: duplicatesRemoved,
      })
      .eq("id", runId)

    if (completeError) {
      throw new Error(`No se pudo cerrar la corrida: ${completeError.message}`)
    }

    recorder.emit("run.completed", "Corrida completada", {
      inserted,
      duplicatesRemoved,
      durationMs: ended.getTime() - started.getTime(),
    })
    await recorder.flush()

    return {
      runId,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: ended.getTime() - started.getTime(),
      searches,
      candidates: candidates.length,
      inserted,
      duplicatesRemoved,
      failedSearches: searches.filter((search) => search.error).length,
      routines,
    }
  } catch (error) {
    // n8n dejaba la corrida colgada en "running" para siempre si algo fallaba.
    const message = error instanceof Error ? error.message : String(error)
    recorder.emit("run.failed", "Corrida fallida", { error: message })
    await recorder.flush()

    await supabase
      .from("pipeline_runs")
      .update({
        ended_at: new Date().toISOString(),
        status: "failed",
        error_message: message.slice(0, 2000),
      })
      .eq("id", runId)

    throw error
  }
}

/**
 * Ensayo sin efectos: corre las busquedas de verdad y reporta que pasaria, pero
 * no abre corrida, no inserta, no borra y no llama rutinas.
 */
export async function dryRunIngestion(
  options: { accountId: string; signal?: AbortSignal; onEvent?: EventSink }
): Promise<DryRunSummary> {
  const supabase = supabaseAdmin()
  const started = new Date()
  const recorder = new EventRecorder(null, options.onEvent)

  recorder.emit("run.started", "Ensayo en seco iniciado")
  const specs = await getActiveSearches(options.accountId)
  const { searches, candidates } = await collectCandidates(specs, recorder, options.signal)

  const known = new Set<string>()
  for (const batch of chunk(candidates.map((row) => row.link), 200)) {
    const { data, error } = await supabase
      .from("raw_news")
      .select("link")
      .eq("account_id", options.accountId)
      .in("link", batch)
    if (error) throw new Error(`Fallo al comprobar links existentes: ${error.message}`)
    for (const row of data ?? []) known.add((row as { link: string }).link)
  }

  const alreadyKnown = candidates.filter((row) => known.has(row.link)).length
  recorder.emit("run.completed", "Ensayo completado (no se escribio nada)", {
    wouldInsert: candidates.length - alreadyKnown,
  })

  return {
    startedAt: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    searches,
    candidates: candidates.length,
    wouldInsert: candidates.length - alreadyKnown,
    alreadyKnown,
    failedSearches: searches.filter((search) => search.error).length,
  }
}
