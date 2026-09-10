import { supabaseAdmin } from "../supabase-admin"

/**
 * Traza de una pasada del tick.
 *
 * Escribe en `pipeline_events` con `run_id = null`: los eventos de contenido no
 * pertenecen a ninguna corrida de ingesta, pero comparten el feed de actividad y
 * asi se ven en orden junto al resto del motor.
 *
 * No se reutiliza `EventRecorder` porque su `flush()` sale sin hacer nada cuando
 * `runId` es null — es lo que quiere el ensayo en seco de la ingesta, y cambiarlo
 * alteraria ese comportamiento.
 */

export type ContentEventKind =
  | "content.tick.started"
  | "content.angle.queued"
  | "content.angle.created"
  | "content.angle.failed"
  | "content.linkedin.queued"
  | "content.piece.created"
  | "content.linkedin.failed"
  | "content.carousel.created"
  | "content.instagram.failed"
  | "content.piece.published"
  | "content.publish.failed"
  | "content.routine.called"
  | "content.routine.failed"
  | "content.tick.completed"

export type ContentEvent = {
  kind: ContentEventKind
  label: string
  detail?: Record<string, unknown>
  at: string
}

export class ContentLog {
  private buffer: ContentEvent[] = []

  emit(kind: ContentEventKind, label: string, detail?: Record<string, unknown>) {
    this.buffer.push({ kind, label, detail, at: new Date().toISOString() })
  }

  get events(): ContentEvent[] {
    return this.buffer
  }

  /** Nunca lanza: perder la traza no puede tumbar una pasada que ya hizo su trabajo. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const rows = this.buffer.map((event) => ({
      run_id: null,
      at: event.at,
      kind: event.kind,
      label: event.label,
      detail: event.detail ?? null,
    }))

    try {
      await supabaseAdmin().from("pipeline_events").insert(rows)
      this.buffer = []
    } catch {
      // Silencio deliberado.
    }
  }
}
