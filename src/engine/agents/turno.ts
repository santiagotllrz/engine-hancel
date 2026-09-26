import { dayIn, partsIn } from "../schedule"
import type { AjustesAgente } from "./settings"

/**
 * Si a un agente le toca correr ahora.
 *
 * El tick pasa cada pocos minutos, asi que la misma hora programada se evalua
 * varias veces: `last_run_at` es lo unico que impide repetir la tanda. Se
 * compara por hora local y no por marca exacta porque el disparo nunca cae en
 * el mismo segundo.
 *
 * El motivo viaja con la decision a proposito. Un agente que no corre es la
 * pregunta que mas se hace al mirar el tablero, y sin el motivo hay que leer
 * codigo para contestarla.
 */
export type Turno =
  | { corre: true; motivo: string }
  | { corre: false; motivo: string }

export function leToca(
  ajustes: AjustesAgente,
  timezone: string,
  now: Date,
  /** Lo que dispara la pasada. Una pasada a mano ignora el horario. */
  disparo: "auto" | "manual" = "auto"
): Turno {
  // Apagado manda sobre todo, incluso sobre un disparo a mano: un agente fuera
  // de servicio no es un agente en pausa, es un paso que esta cuenta no hace.
  if (!ajustes.enabled) {
    return { corre: false, motivo: "Esta apagado." }
  }

  // A mano siempre corre: el boton del tablero esta justo para eso, para no
  // tener que esperar a la hora ni cambiar el modo para una pasada suelta.
  if (disparo === "manual") return { corre: true, motivo: "Disparado a mano." }

  if (ajustes.mode === "manual") {
    return { corre: false, motivo: "Esta en manual: solo corre desde el tablero." }
  }

  if (ajustes.mode === "automatico") {
    return { corre: true, motivo: "Automatico: corre en cuanto hay trabajo." }
  }

  // Programado: corre en cuanto pasa una de sus horas, y una sola vez por hora.
  if (ajustes.run_at.length === 0) {
    return { corre: false, motivo: "Programado pero sin horas: no corre nunca." }
  }

  const { hour, minute } = partsIn(timezone, now)
  const ahora = hour * 60 + minute
  const horario = ajustes.run_at.map(comoHora).join(", ")

  // La ultima que ya toco. Se compara con "menor o igual" y no con igualdad
  // porque el tick pasa cada pocos minutos y nunca cae en el minuto exacto: sin
  // esto, una hora programada se saltaria siempre que el tick no acertara justo.
  const vencidas = ajustes.run_at.filter((m) => m <= ahora)
  if (vencidas.length === 0) {
    return { corre: false, motivo: `Son las ${comoHora(ahora)}; corre a las ${horario}.` }
  }
  const toca = vencidas[vencidas.length - 1]

  if (ajustes.last_run_at) {
    const anterior = new Date(ajustes.last_run_at)
    const ultima = partsIn(timezone, anterior)
    // El dia, en la zona de la cuenta. Comparar aqui el dia del servidor —UTC
    // en produccion— con la hora de la cuenta es mezclar dos relojes: las
    // 19:00 de ayer en Bogota ya son hoy en UTC, asi que la pasada de las 9:00
    // se daba por hecha "a las 19:00" y se saltaban todos los horarios del dia.
    const mismoDia = dayIn(timezone, anterior) === dayIn(timezone, now)
    if (mismoDia && ultima.hour * 60 + ultima.minute >= toca) {
      return { corre: false, motivo: `La pasada de las ${comoHora(toca)} ya se hizo.` }
    }
  }

  return { corre: true, motivo: `Pasada de las ${comoHora(toca)}.` }
}

/** Un minuto del dia como hora legible: 545 es 09:05. */
export function comoHora(minutos: number): string {
  return `${dos(Math.floor(minutos / 60))}:${dos(minutos % 60)}`
}

function dos(n: number): string {
  return String(n).padStart(2, "0")
}

/** Las proximas horas previstas, para enseñarlas en la interfaz. */
export function proximasPasadas(
  ajustes: AjustesAgente,
  timezone: string,
  now: Date,
  cuantas = 3
): string[] {
  if (ajustes.mode !== "programado" || ajustes.run_at.length === 0) return []

  const { hour, minute } = partsIn(timezone, now)
  const ahora = hour * 60 + minute
  const salidas: string[] = []

  for (const m of ajustes.run_at) {
    if (salidas.length >= cuantas) break
    if (m > ahora) salidas.push(comoHora(m))
  }
  for (const m of ajustes.run_at) {
    if (salidas.length >= cuantas) break
    salidas.push(`mañana ${comoHora(m)}`)
  }

  return salidas
}
