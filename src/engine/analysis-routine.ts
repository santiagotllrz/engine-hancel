import { fireRoutine, routineConfig, type RoutineSlot } from "./routine-webhook"
import type { RoutineCallResult } from "./routines"

/**
 * Disparo de la rutina de analisis de Claude Code.
 *
 * La mecanica vive en `routine-webhook.ts`, compartida con las rutinas de la
 * etapa 2; aqui solo queda que par de variables de entorno la definen.
 */

export const ANALYSIS_ROUTINE_NAME = "Rutina de analisis"

const ANALYSIS_SLOT: RoutineSlot = {
  name: ANALYSIS_ROUTINE_NAME,
  urlVar: "ANALYSIS_ROUTINE_URL",
  tokenVar: "ANALYSIS_ROUTINE_TOKEN",
}

/** `null` si falta configuracion, que es lo que distingue "no montada" de "fallo". */
export function analysisRoutineConfig(): { url: string; token: string } | null {
  return routineConfig(ANALYSIS_SLOT)
}

/** No lanza nunca: el fallo viaja en el resultado. */
export async function fireAnalysisRoutine(
  input: string,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  return fireRoutine(ANALYSIS_SLOT, input, signal)
}
