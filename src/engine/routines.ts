import { supabaseAdmin } from "./supabase-admin"

/**
 * Una rutina de Claude invocable por webhook.
 *
 * `kind` decide en que momento del motor se llama:
 *   analysis  -> justo despues de la ingesta, sobre las noticias recien traidas
 *   writing   -> mas adelante, para redactar a partir de lo analizado
 *   other     -> se dispara solo a mano
 */
export type RoutineKind = "analysis" | "writing" | "other"

export type Routine = {
  id: string
  name: string
  kind: string
  webhook_url: string | null
  token: string | null
  is_active: boolean
  last_called_at: string | null
  last_status: string | null
  last_error: string | null
  created_at: string
}

export type RoutineCallResult = {
  routine: string
  ok: boolean
  status?: number
  error?: string
}

/** Rutinas activas de un tipo, en orden de creacion. */
export async function getActiveRoutines(kind: RoutineKind): Promise<Routine[]> {
  const { data, error } = await supabaseAdmin()
    .from("engine_routines")
    .select("*")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("created_at")

  if (error) throw new Error(`No se pudieron cargar las rutinas: ${error.message}`)
  return (data ?? []) as Routine[]
}

/**
 * Invoca el webhook de una rutina y anota el resultado en su fila.
 *
 * No lanza: una rutina caida no puede tumbar la ingesta, que ya guardo las
 * noticias. El fallo queda en `last_error` y en el resumen de la corrida.
 *
 * El token viaja como `Authorization: Bearer`, que es lo que espera un webhook
 * de rutina de Claude, y ademas como `X-Routine-Token` por si el receptor lo
 * lee de una cabecera propia.
 */
export async function callRoutine(
  routine: Routine,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  if (!routine.webhook_url) {
    return {
      routine: routine.name,
      ok: false,
      error: "La rutina no tiene URL de webhook configurada.",
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (routine.token) {
    headers.Authorization = `Bearer ${routine.token}`
    headers["X-Routine-Token"] = routine.token
  }

  let result: RoutineCallResult
  try {
    const response = await fetch(routine.webhook_url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    })

    result = response.ok
      ? { routine: routine.name, ok: true, status: response.status }
      : {
          routine: routine.name,
          ok: false,
          status: response.status,
          error: (await response.text().catch(() => "")).slice(0, 500),
        }
  } catch (error) {
    result = {
      routine: routine.name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  try {
    await supabaseAdmin()
      .from("engine_routines")
      .update({
        last_called_at: new Date().toISOString(),
        last_status: result.ok ? `ok ${result.status ?? ""}`.trim() : "error",
        last_error: result.ok ? null : (result.error ?? "fallo desconocido").slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", routine.id)
  } catch {
    // Anotar el resultado es util, pero no imprescindible.
  }

  return result
}
