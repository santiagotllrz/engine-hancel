import { supabaseAdmin } from "./supabase-admin"

/**
 * Tipos de evento que emite una corrida. El nombre viaja tal cual a la vista en
 * vivo y a `pipeline_events.kind`, asi que anadir uno nuevo obliga a decidir
 * como se pinta (ver `EVENT_STYLES` en el cliente).
 */
export type EngineEventKind =
  | "run.started"
  | "search.started"
  | "search.done"
  | "search.failed"
  | "harvest.done"
  | "insert.done"
  | "dedupe.scanned"
  | "dedupe.removed"
  | "routine.called"
  | "routine.skipped"
  | "routine.failed"
  | "run.completed"
  | "run.failed"

export type EngineEvent = {
  kind: EngineEventKind
  label: string
  detail?: Record<string, unknown>
  at: string
}

export type EventSink = (event: EngineEvent) => void

/**
 * Recolecta los eventos de una corrida.
 *
 * Doble destino a proposito: el sink va al stream SSE para que la UI los vea
 * llegar en el momento, y el buffer se vuelca a `pipeline_events` al final para
 * que la corrida se pueda revisar despues. Volcar al final y no evento por
 * evento evita meter una escritura de red en medio de cada paso del motor.
 */
export class EventRecorder {
  private buffer: EngineEvent[] = []

  constructor(
    private runId: string | null,
    private sink?: EventSink,
    /** La cuenta de la corrida. Sin ella los eventos no se podrian separar. */
    private accountId?: string
  ) {}

  emit(kind: EngineEventKind, label: string, detail?: Record<string, unknown>) {
    const event: EngineEvent = {
      kind,
      label,
      detail,
      at: new Date().toISOString(),
    }
    this.buffer.push(event)
    this.sink?.(event)
  }

  get events(): EngineEvent[] {
    return this.buffer
  }

  /** Persiste lo acumulado. Nunca lanza: perder la traza no debe tumbar la corrida. */
  async flush(): Promise<void> {
    if (!this.runId || this.buffer.length === 0) return

    const rows = this.buffer.map((event) => ({
      account_id: this.accountId,
      run_id: this.runId,
      at: event.at,
      kind: event.kind,
      label: event.label,
      detail: event.detail ?? null,
    }))

    try {
      await supabaseAdmin().from("pipeline_events").insert(rows)
      this.buffer = []
    } catch {
      // Silencio deliberado: la corrida ya hizo su trabajo.
    }
  }
}
