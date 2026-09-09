import type { RoutineCallResult } from "./routines"

/**
 * Disparo generico de una rutina de Claude Code configurada por entorno.
 *
 * Extraido de `analysis-routine.ts` cuando aparecio la segunda rutina: la
 * mecanica (cabeceras, timeout, no lanzar nunca) es identica para todas y lo
 * unico que cambia es que par de variables de entorno la definen.
 *
 * Todas viven en el entorno y no en `engine_routines` a proposito: son piezas
 * que no pueden perderse si hay que recrear la base.
 */

export const ANTHROPIC_VERSION = "2023-06-01"
export const ROUTINE_BETA = "experimental-cc-routine-2026-04-01"

/** Igual que el timeout del nodo HTTP que usaba n8n. */
export const ROUTINE_TIMEOUT_MS = 30_000

/** Una rutina: como se llama en la interfaz y de donde salen su URL y su token. */
export type RoutineSlot = {
  name: string
  urlVar: string
  tokenVar: string
}

/** `null` si falta configuracion, que es lo que distingue "no montada" de "fallo". */
export function routineConfig(slot: RoutineSlot): { url: string; token: string } | null {
  const url = process.env[slot.urlVar]
  const token = process.env[slot.tokenVar]
  if (!url || !token) return null
  return { url, token }
}

/**
 * Llama al endpoint `/fire` de la rutina.
 *
 * Es un gatillo y nada mas: el `input` solo avisa de que hay trabajo. Los datos
 * viajan en la fila del buzon, que la rutina lee por su cuenta.
 *
 * No lanza nunca: una rutina caida no puede tumbar un proceso que ya guardo su
 * trabajo en la base. El fallo viaja en el resultado.
 */
export async function fireRoutine(
  slot: RoutineSlot,
  input: string,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  const config = routineConfig(slot)
  if (!config) {
    return {
      routine: slot.name,
      ok: false,
      error: `Faltan ${slot.urlVar} y/o ${slot.tokenVar} en el entorno.`,
    }
  }

  // Timeout propio: sin el, una rutina que no contesta bloquea a quien la llamo
  // hasta agotar el maxDuration de la funcion.
  const timeout = AbortSignal.timeout(ROUTINE_TIMEOUT_MS)
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
      return { routine: slot.name, ok: true, status: response.status }
    }

    return {
      routine: slot.name,
      ok: false,
      status: response.status,
      error: (await response.text().catch(() => "")).slice(0, 500),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      routine: slot.name,
      ok: false,
      error: timeout.aborted
        ? `La rutina no respondio en ${ROUTINE_TIMEOUT_MS / 1000}s.`
        : message,
    }
  }
}
