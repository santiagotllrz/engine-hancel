import { supabaseAdmin } from "./supabase-admin"

export type EngineSettings = {
  run_hours: number[]
  timezone: string
  enabled: boolean
  updated_at: string
}

const DEFAULTS: EngineSettings = {
  run_hours: [11, 18],
  timezone: "America/Bogota",
  enabled: true,
  updated_at: new Date(0).toISOString(),
}

export async function getSettings(): Promise<EngineSettings> {
  const { data, error } = await supabaseAdmin()
    .from("engine_settings")
    .select("run_hours, timezone, enabled, updated_at")
    .eq("id", true)
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
 * Hora local (0-23) en la zona indicada.
 *
 * `hourCycle: "h23"` es lo que evita que medianoche salga como 24, que es lo
 * que devuelven algunos locales con `hour12: false`.
 */
export function hourIn(timezone: string, now: Date): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now)
    return Number(formatted)
  } catch {
    return now.getUTCHours()
  }
}

export type ScheduleDecision =
  | { run: true; hour: number }
  | { run: false; reason: string; hour: number }

/**
 * Decide si al cron le toca correr ahora.
 *
 * El scheduler externo dispara cada hora y la decision vive aqui, en la base,
 * para que cambiar los horarios sea editar un campo y no volver a desplegar.
 */
export function decide(settings: EngineSettings, now: Date): ScheduleDecision {
  const hour = hourIn(settings.timezone, now)

  if (!settings.enabled) {
    return { run: false, reason: "La programacion automatica esta desactivada.", hour }
  }
  if (settings.run_hours.length === 0) {
    return { run: false, reason: "No hay horas configuradas.", hour }
  }
  if (!settings.run_hours.includes(hour)) {
    return {
      run: false,
      reason: `Son las ${String(hour).padStart(2, "0")}:00 en ${settings.timezone}; las horas programadas son ${settings.run_hours
        .map((value) => `${String(value).padStart(2, "0")}:00`)
        .join(", ")}.`,
      hour,
    }
  }

  return { run: true, hour }
}

/** Proximas ejecuciones previstas, para mostrarlas en la UI. */
export function nextRuns(settings: EngineSettings, now: Date, count = 3): string[] {
  if (!settings.enabled || settings.run_hours.length === 0) return []

  const current = hourIn(settings.timezone, now)
  const upcoming: string[] = []

  for (let offset = 0; offset < 24 * 7 && upcoming.length < count; offset++) {
    const hour = (current + offset) % 24
    const day = Math.floor((current + offset) / 24)
    if (offset === 0) continue
    if (settings.run_hours.includes(hour)) {
      const label = `${String(hour).padStart(2, "0")}:00`
      upcoming.push(day === 0 ? `hoy ${label}` : day === 1 ? `mañana ${label}` : `en ${day} dias ${label}`)
    }
  }

  return upcoming
}
