import { fireRoutine, routineConfig, type RoutineSlot } from "../routine-webhook"
import type { RoutineCallResult } from "../routines"

/**
 * Las dos rutinas de la etapa 2, configuradas por entorno.
 *
 * Claude Code no las crea ni edita: sus prompts viven en Claude y son un
 * contrato externo. Aqui solo esta el gatillo.
 */

export const ANGLE_ROUTINE_NAME = "Rutina de angulo"
export const LINKEDIN_ROUTINE_NAME = "Rutina de LinkedIn"

export const ANGLE_SLOT: RoutineSlot = {
  name: ANGLE_ROUTINE_NAME,
  urlVar: "ANGLE_ROUTINE_URL",
  tokenVar: "ANGLE_ROUTINE_TOKEN",
}

export const LINKEDIN_SLOT: RoutineSlot = {
  name: LINKEDIN_ROUTINE_NAME,
  urlVar: "LINKEDIN_ROUTINE_URL",
  tokenVar: "LINKEDIN_ROUTINE_TOKEN",
}

export function angleRoutineConfig() {
  return routineConfig(ANGLE_SLOT)
}

export function linkedinRoutineConfig() {
  return routineConfig(LINKEDIN_SLOT)
}

/**
 * "Despierta y revisa la cola".
 *
 * El aviso no transporta el trabajo ni trae el resultado: la rutina busca las
 * filas `pending` por su cuenta y escribe la respuesta en el buzon. Por eso el
 * `input` es una frase y no los datos.
 */
export async function fireAngleRoutine(
  pendientes: number,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  return fireRoutine(
    ANGLE_SLOT,
    `Hay ${pendientes} trabajos pendientes en la tabla jobs_angle. ` +
      `Procesalos siguiendo las instrucciones de la rutina.`,
    signal
  )
}

export async function fireLinkedinRoutine(
  pendientes: number,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  return fireRoutine(
    LINKEDIN_SLOT,
    `Hay ${pendientes} trabajos pendientes en la tabla jobs_linkedin. ` +
      `Procesalos siguiendo las instrucciones de la rutina.`,
    signal
  )
}
