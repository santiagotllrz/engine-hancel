/**
 * Postgres puede devolver "2026-08-23 03:40:45.144499+00" (espacio, offset
 * corto), que `new Date()` no parsea de forma fiable. Lo normalizamos a ISO.
 */
function toDate(value: string | null): Date | null {
  if (!value) return null
  const iso = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Formatea en UTC y con locale fijo a proposito: el servidor y el navegador
 * deben producir la misma cadena o React reporta un error de hidratacion.
 */
const dateTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDateTime(value: string | null): string {
  const date = toDate(value)
  return date ? `${dateTime.format(date)} UTC` : "—"
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value)
}

/** Etiquetas legibles para los valores de `status` que usa el pipeline. */
export const STATUS_LABELS: Record<string, string> = {
  pending_analysis: "Pendiente de analisis",
  analyzed: "Analizada",
  pending: "Pendiente",
  success: "Completado",
  failed: "Fallido",
  running: "En ejecucion",
  completed: "Completado",
}

export function statusLabel(value: string | null): string {
  if (!value) return "—"
  return STATUS_LABELS[value] ?? value
}
