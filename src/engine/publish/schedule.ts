import { partsIn } from "../schedule"
import { supabaseAdmin } from "../supabase-admin"

/**
 * Cuando y cuanto se publica, por red.
 *
 * Dos formas de usarlo:
 *   sin horas   publica en cuanto hay algo, que es el comportamiento del viejo
 *               interruptor de autopublicar.
 *   con horas   publica en tandas: a las horas marcadas, hasta `batch_size`
 *               piezas, y lo que sobre espera a la siguiente.
 *
 * La zona horaria sale de `engine_settings`, para que toda la aplicacion hable
 * de un solo huso.
 */

export type Network = "linkedin" | "instagram"

export type PublishSchedule = {
  network: Network
  enabled: boolean
  run_hours: number[]
  run_minute: number
  batch_size: number
  last_batch_at: string | null
  updated_at: string
}

export async function getPublishSchedules(): Promise<PublishSchedule[]> {
  const { data, error } = await supabaseAdmin()
    .from("publish_schedule")
    .select("*")
    .order("network")

  if (error) throw new Error(`No se pudo leer la programacion: ${error.message}`)

  return ((data ?? []) as PublishSchedule[]).map((fila) => ({
    ...fila,
    run_hours: [...(fila.run_hours ?? [])].sort((a, b) => a - b),
  }))
}

export type DecisionTanda =
  | { publicar: true; cantidad: number; motivo: string }
  | { publicar: false; motivo: string }

/**
 * Decide si a esta red le toca publicar ahora y cuantas piezas.
 *
 * El tick pasa cada cinco minutos, asi que la misma hora programada se evalua
 * varias veces: `last_batch_at` es lo que impide repetir la tanda. Se compara
 * por hora local y no por marca de tiempo exacta porque el disparo nunca cae en
 * el mismo segundo.
 */
export function decidirTanda(
  schedule: PublishSchedule,
  timezone: string,
  now: Date
): DecisionTanda {
  if (!schedule.enabled) {
    return { publicar: false, motivo: "La publicacion automatica esta apagada." }
  }

  // Sin horas: el modo "en cuanto haya", sin ventanas ni tandas que respetar.
  if (schedule.run_hours.length === 0) {
    return {
      publicar: true,
      cantidad: schedule.batch_size,
      motivo: "Sin horario: se publica en cuanto hay piezas listas.",
    }
  }

  const { hour, minute } = partsIn(timezone, now)

  if (!schedule.run_hours.includes(hour)) {
    return {
      publicar: false,
      motivo: `Son las ${String(hour).padStart(2, "0")}:00; las tandas son a las ${schedule.run_hours
        .map((h) => `${String(h).padStart(2, "0")}:${String(schedule.run_minute).padStart(2, "0")}`)
        .join(", ")}.`,
    }
  }

  if (minute < schedule.run_minute) {
    return {
      publicar: false,
      motivo: `La tanda de las ${String(hour).padStart(2, "0")}:${String(
        schedule.run_minute
      ).padStart(2, "0")} aun no ha llegado.`,
    }
  }

  if (schedule.last_batch_at) {
    const ultima = partsIn(timezone, new Date(schedule.last_batch_at))
    const mismoDia =
      new Date(schedule.last_batch_at).toDateString() === now.toDateString()
    if (mismoDia && ultima.hour === hour) {
      return { publicar: false, motivo: "La tanda de esta hora ya se publico." }
    }
  }

  return {
    publicar: true,
    cantidad: schedule.batch_size,
    motivo: `Tanda de las ${String(hour).padStart(2, "0")}:${String(schedule.run_minute).padStart(2, "0")}.`,
  }
}

/** Cierra la tanda para que el siguiente tick de la misma hora no la repita. */
export async function marcarTanda(network: Network): Promise<void> {
  await supabaseAdmin()
    .from("publish_schedule")
    .update({ last_batch_at: new Date().toISOString() })
    .eq("network", network)
}

/** Las proximas tandas previstas, para enseñarlas en la interfaz. */
export function proximasTandas(
  schedule: PublishSchedule,
  timezone: string,
  now: Date,
  cuantas = 3
): string[] {
  if (!schedule.enabled) return []
  if (schedule.run_hours.length === 0) return ["en cuanto haya piezas listas"]

  const { hour: actual, minute } = partsIn(timezone, now)
  const proximas: string[] = []

  for (let salto = 0; salto < 24 * 7 && proximas.length < cuantas; salto++) {
    const hora = (actual + salto) % 24
    const dia = Math.floor((actual + salto) / 24)
    // La hora en curso solo cuenta si su minuto aun no ha pasado.
    if (salto === 0 && minute >= schedule.run_minute) continue
    if (!schedule.run_hours.includes(hora)) continue

    const etiqueta = `${String(hora).padStart(2, "0")}:${String(schedule.run_minute).padStart(2, "0")}`
    proximas.push(dia === 0 ? `hoy ${etiqueta}` : dia === 1 ? `mañana ${etiqueta}` : `en ${dia} dias ${etiqueta}`)
  }

  return proximas
}
