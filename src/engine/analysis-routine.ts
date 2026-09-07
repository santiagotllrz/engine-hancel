import type { RoutineCallResult } from "./routines"

/**
 * Disparo de la rutina de analisis de Claude Code.
 *
 * Vive en variables de entorno y no en `engine_routines` a proposito: es la
 * pieza que no puede perderse si hay que recrear la base.
 *
 * Es un gatillo y nada mas. La rutina ya sabe que noticias le tocan y como
 * analizarlas, definido en su propia interfaz, asi que aqui no se le mandan
 * ids: el `input` solo le avisa de que hay trabajo nuevo.
 */

const ANTHROPIC_VERSION = "2023-06-01"
const ROUTINE_BETA = "experimental-cc-routine-2026-04-01"

/** Igual que el timeout del nodo HTTP de n8n. */
const TIMEOUT_MS = 30_000

/** Nombre con el que aparece en el resumen de la corrida y en la vista en vivo. */
export const ANALYSIS_ROUTINE_NAME = "Rutina de analisis"

/** `null` si falta configuracion, que es lo que distingue "no montada" de "fallo". */
export function analysisRoutineConfig(): { url: string; token: string } | null {
  const url = process.env.ANALYSIS_ROUTINE_URL
  const token = process.env.ANALYSIS_ROUTINE_TOKEN
  if (!url || !token) return null
  return { url, token }
}

/**
 * Llama al endpoint `/fire` de la rutina.
 *
 * No lanza nunca: una rutina caida no puede tumbar una corrida que ya guardo
 * las noticias. El fallo viaja en el resultado y queda en el resumen.
 */
export async function fireAnalysisRoutine(
  input: string,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  const config = analysisRoutineConfig()
  if (!config) {
    return {
      routine: ANALYSIS_ROUTINE_NAME,
      ok: false,
      error: "Faltan ANALYSIS_ROUTINE_URL y/o ANALYSIS_ROUTINE_TOKEN en el entorno.",
    }
  }

  // Timeout propio: sin el, una rutina que no contesta bloquea el cierre de la
  // corrida hasta agotar el maxDuration de la funcion.
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ROUTINE_BETA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
      signal: combined,
    })

    if (response.ok) {
      return { routine: ANALYSIS_ROUTINE_NAME, ok: true, status: response.status }
    }

    return {
      routine: ANALYSIS_ROUTINE_NAME,
      ok: false,
      status: response.status,
      error: (await response.text().catch(() => "")).slice(0, 500),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      routine: ANALYSIS_ROUTINE_NAME,
      ok: false,
      error: timeout.aborted ? `La rutina no respondio en ${TIMEOUT_MS / 1000}s.` : message,
    }
  }
}
