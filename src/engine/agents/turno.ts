import { partsIn } from "../schedule"
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
  // A mano siempre corre: el boton del tablero esta justo para eso, para no
  // tener que esperar a la hora ni cambiar el modo para una pasada suelta.
  if (disparo === "manual") return { corre: true, motivo: "Disparado a mano." }

  if (ajustes.mode === "manual") {
    return { corre: false, motivo: "Esta en manual: solo corre desde el tablero." }
  }

  if (ajustes.mode === "automatico") {
    return { corre: true, motivo: "Automatico: corre en cuanto hay trabajo." }
  }

  // Programado: solo dentro de su ventana, y una vez por ventana.
  if (ajustes.run_hours.length === 0) {
    return { corre: false, motivo: "Programado pero sin horas: no corre nunca." }
  }

  const { hour, minute } = partsIn(timezone, now)
  const horario = ajustes.run_hours
    .map((h) => `${dos(h)}:${dos(ajustes.run_minute)}`)
    .join(", ")

  if (!ajustes.run_hours.includes(hour)) {
    return { corre: false, motivo: `Son las ${dos(hour)}:00; corre a las ${horario}.` }
  }

  if (minute < ajustes.run_minute) {
    return {
      corre: false,
      motivo: `La pasada de las ${dos(hour)}:${dos(ajustes.run_minute)} aun no ha llegado.`,
    }
  }

  if (ajustes.last_run_at) {
    const anterior = new Date(ajustes.last_run_at)
    const ultima = partsIn(timezone, anterior)
    if (anterior.toDateString() === now.toDateString() && ultima.hour === hour) {
      return { corre: false, motivo: "La pasada de esta hora ya se hizo." }
    }
  }

  return { corre: true, motivo: `Pasada de las ${dos(hour)}:${dos(ajustes.run_minute)}.` }
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
  if (ajustes.mode !== "programado" || ajustes.run_hours.length === 0) return []

  const { hour, minute } = partsIn(timezone, now)
  const salidas: string[] = []

  // Dos vueltas: lo que queda de hoy y, si no llena, el principio de mañana.
  for (const dia of ["hoy", "mañana"] as const) {
    for (const h of ajustes.run_hours) {
      if (salidas.length >= cuantas) break
      const yaPaso = h < hour || (h === hour && minute >= ajustes.run_minute)
      if (dia === "hoy" && yaPaso) continue
      salidas.push(`${dia === "hoy" ? "" : "mañana "}${dos(h)}:${dos(ajustes.run_minute)}`)
    }
  }

  return salidas
}
