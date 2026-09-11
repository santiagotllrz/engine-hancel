import { supabaseAdmin } from "./supabase-admin"

export type EngineSettings = {
  run_hours: number[]
  /** Minuto comun a todas las horas: 11 y 18 con `run_minute` 30 son 11:30 y 18:30. */
  run_minute: number
  timezone: string
  enabled: boolean
  /** Cuando corrio la ultima ingesta. Cierra la ventana de la hora en curso. */
  last_ingest_at: string | null
  updated_at: string
}

const DEFAULTS: EngineSettings = {
  run_hours: [11, 18],
  run_minute: 0,
  timezone: "America/Bogota",
  enabled: true,
  last_ingest_at: null,
  updated_at: new Date(0).toISOString(),
}

export async function getSettings(accountId: string): Promise<EngineSettings> {
  const { data, error } = await supabaseAdmin()
    .from("engine_settings")
    .select("run_hours, run_minute, timezone, enabled, last_ingest_at, updated_at")
    .eq("account_id", accountId)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la configuracion: ${error.message}`)
  if (!data) return DEFAULTS

  const settings = data as EngineSettings
  return {
    ...settings,
    run_hours: [...settings.run_hours].sort((a, b) => a - b),
  }
}

/**
 * Hora y minuto locales en la zona indicada.
 *
 * `hourCycle: "h23"` es lo que evita que medianoche salga como 24, que es lo
 * que devuelven algunos locales con `hour12: false`.
 */
export function partsIn(
  timezone: string,
  now: Date
): { hour: number; minute: number } {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).format(now)
    const [hour, minute] = formatted.split(":").map(Number)
    return { hour, minute }
  } catch {
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() }
  }
}

/** Hora local (0-23) en la zona indicada. */
export function hourIn(timezone: string, now: Date): number {
  return partsIn(timezone, now).hour
}

/** "11:30", para mensajes y para la lista de proximas ejecuciones. */
export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export type ScheduleDecision =
  | { run: true; hour: number }
  | { run: false; reason: string; hour: number }

/**
 * Decide si a una llamada sin `force` le toca correr ahora.
 *
 * Compara solo la hora, no el minuto, a proposito: quien planifica de verdad es
 * el job de pg_cron, que dispara con `?force=1` y se salta esta comprobacion.
 * Esto es la red de seguridad para llamadas externas, que pueden llegar en
 * cualquier minuto de la hora buena.
 */
export function decide(settings: EngineSettings, now: Date): ScheduleDecision {
  const { hour } = partsIn(settings.timezone, now)

  if (!settings.enabled) {
    return { run: false, reason: "La programacion automatica esta desactivada.", hour }
  }
  if (settings.run_hours.length === 0) {
    return { run: false, reason: "No hay horas configuradas.", hour }
  }
  if (!settings.run_hours.includes(hour)) {
    return {
      run: false,
      reason: `Son las ${formatTime(hour, 0)} en ${settings.timezone}; las horas programadas son ${settings.run_hours
        .map((value) => formatTime(value, settings.run_minute))
        .join(", ")}.`,
      hour,
    }
  }

  // El cron es la union de los horarios de todas las cuentas, asi que dentro de
  // una misma hora puede disparar varias veces. Sin esta guarda, una cuenta
  // ingeriria dos veces seguidas y gastaria el doble de cuota de Serper para
  // traer lo mismo.
  if (settings.last_ingest_at) {
    const ultima = new Date(settings.last_ingest_at)
    const anterior = partsIn(settings.timezone, ultima)
    if (ultima.toDateString() === now.toDateString() && anterior.hour === hour) {
      return { run: false, reason: "La ingesta de esta hora ya corrio.", hour }
    }
  }

  return { run: true, hour }
}

/** Proximas ejecuciones previstas, para mostrarlas en la UI. */
export function nextRuns(settings: EngineSettings, now: Date, count = 3): string[] {
  if (!settings.enabled || settings.run_hours.length === 0) return []

  const { hour: current, minute } = partsIn(settings.timezone, now)
  const upcoming: string[] = []

  for (let offset = 0; offset < 24 * 7 && upcoming.length < count; offset++) {
    const hour = (current + offset) % 24
    const day = Math.floor((current + offset) / 24)
    // La hora en curso solo cuenta si su minuto aun no ha pasado.
    if (offset === 0 && minute >= settings.run_minute) continue
    if (settings.run_hours.includes(hour)) {
      const label = formatTime(hour, settings.run_minute)
      upcoming.push(day === 0 ? `hoy ${label}` : day === 1 ? `mañana ${label}` : `en ${day} dias ${label}`)
    }
  }

  return upcoming
}

/** Cierra la ventana de la hora en curso para que el siguiente disparo no repita. */
export async function marcarIngesta(accountId: string): Promise<void> {
  await supabaseAdmin()
    .from("engine_settings")
    .update({ last_ingest_at: new Date().toISOString() })
    .eq("account_id", accountId)
}
