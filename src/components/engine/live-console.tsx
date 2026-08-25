"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  EngineNetwork,
  type NetworkSegment,
  type SegmentState,
} from "@/components/engine/engine-network"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { EngineEvent } from "@/engine/events"
import { PlayIcon, FlaskConicalIcon, LoaderCircleIcon } from "lucide-react"

export type SpokeSeed = {
  key: string
  label: string
  niche: string
  color: string
  /** Noticias que este segmento ya tiene guardadas. */
  stored: number
}

type Status = "idle" | "running" | "done" | "error"

type Summary = {
  runId?: string | null
  inserted?: number
  duplicatesRemoved?: number
  candidates?: number
  wouldInsert?: number
  alreadyKnown?: number
  durationMs?: number
  failedSearches?: number
  routines?: { routine: string; ok: boolean; error?: string }[]
}

/** Como se pinta cada tipo de evento en el feed. */
const EVENT_DOTS: Record<string, string> = {
  "run.started": "bg-sky-500",
  "search.started": "bg-muted-foreground/40",
  "search.done": "bg-emerald-500",
  "search.failed": "bg-rose-500",
  "harvest.done": "bg-violet-500",
  "insert.done": "bg-emerald-500",
  "dedupe.scanned": "bg-muted-foreground/40",
  "dedupe.removed": "bg-amber-500",
  "routine.called": "bg-sky-500",
  "routine.skipped": "bg-muted-foreground/30",
  "routine.failed": "bg-rose-500",
  "run.completed": "bg-emerald-500",
  "run.failed": "bg-rose-500",
}

function clockOf(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toISOString().slice(11, 19)
}

export function LiveConsole({ seeds }: { seeds: SpokeSeed[] }) {
  const router = useRouter()
  const [status, setStatus] = React.useState<Status>("idle")
  const [mode, setMode] = React.useState<"run" | "dry">("run")
  const [events, setEvents] = React.useState<EngineEvent[]>([])
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [titles, setTitles] = React.useState<{ title: string; color: string }[]>([])
  const [live, setLive] = React.useState<Record<string, { state: SegmentState; found: number }>>({})

  const colorByNiche = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const seed of seeds) map.set(seed.niche, seed.color)
    return map
  }, [seeds])

  const segments: NetworkSegment[] = React.useMemo(
    () =>
      seeds.map((seed) => ({
        ...seed,
        state: live[seed.key]?.state ?? "idle",
        found: live[seed.key]?.found ?? 0,
      })),
    [seeds, live]
  )

  const total = segments.reduce((sum, segment) => sum + segment.stored + segment.found, 0)

  const handleEvent = React.useCallback(
    (event: EngineEvent) => {
      setEvents((current) => [event, ...current].slice(0, 200))
      const key = event.label

      if (event.kind === "search.started") {
        setLive((current) => ({ ...current, [key]: { state: "running", found: 0 } }))
      }

      if (event.kind === "search.done") {
        const found = Number(event.detail?.found ?? 0)
        setLive((current) => ({ ...current, [key]: { state: "done", found } }))

        const incoming = (event.detail?.titles as string[] | undefined) ?? []
        const niche = String(event.detail?.niche ?? "")
        if (incoming.length) {
          setTitles((current) =>
            [
              ...incoming.map((title) => ({
                title,
                color: colorByNiche.get(niche) ?? "#8b8b8b",
              })),
              ...current,
            ].slice(0, 60)
          )
        }
      }

      if (event.kind === "search.failed") {
        setLive((current) => ({ ...current, [key]: { state: "failed", found: 0 } }))
      }
    },
    [colorByNiche]
  )

  async function start(nextMode: "run" | "dry") {
    setStatus("running")
    setMode(nextMode)
    setEvents([])
    setTitles([])
    setSummary(null)
    setError(null)
    setLive({})

    try {
      const response = await fetch(`/api/engine/stream?mode=${nextMode}`, { method: "POST" })
      if (!response.ok || !response.body) {
        throw new Error(await response.text().catch(() => `HTTP ${response.status}`))
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      // Cada bloque separado por linea en blanco es un evento real del motor.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() ?? ""

        for (const block of blocks) {
          const line = block.split("\n").find((part) => part.startsWith("data: "))
          if (!line) continue

          const message = JSON.parse(line.slice(6)) as { type: string; payload: unknown }
          if (message.type === "event") handleEvent(message.payload as EngineEvent)
          if (message.type === "summary") setSummary(message.payload as Summary)
          if (message.type === "error") {
            setError((message.payload as { message: string }).message)
            setStatus("error")
          }
        }
      }

      setStatus((current) => (current === "error" ? current : "done"))
      if (nextMode === "run") router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStatus("error")
    }
  }

  const running = status === "running"

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`size-2 rounded-full ${
              running
                ? "animate-pulse bg-emerald-500"
                : status === "error"
                  ? "bg-rose-500"
                  : "bg-muted-foreground/30"
            }`}
          />
          <span className="text-sm font-medium">
            {running
              ? mode === "dry"
                ? "Ensayo en curso"
                : "Corrida en curso"
              : status === "done"
                ? "Corrida terminada"
                : status === "error"
                  ? "Corrida fallida"
                  : "Motor en reposo"}
          </span>
          <span className="text-muted-foreground text-xs">
            {seeds.length} segmentos activos
          </span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={running} onClick={() => start("dry")}>
            {running && mode === "dry" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <FlaskConicalIcon />
            )}
            Ensayo
          </Button>
          <Button size="sm" disabled={running} onClick={() => start("run")}>
            {running && mode === "run" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <PlayIcon />
            )}
            Ejecutar
          </Button>
        </div>
      </div>

      <div className="grid divide-y lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] lg:divide-x lg:divide-y-0">
        <section className="p-4">
          <h3 className="text-muted-foreground mb-3 text-[10px] tracking-[0.18em] uppercase">
            Actividad del motor
          </h3>
          <ol className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                Sin actividad. Lanza una corrida para ver el motor trabajando.
              </li>
            ) : (
              events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      EVENT_DOTS[event.kind] ?? "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        event.kind.endsWith(".failed") ? "text-destructive" : undefined
                      }
                    >
                      {event.label}
                    </span>
                    {typeof event.detail?.found === "number" ? (
                      <span className="text-muted-foreground ml-1.5">
                        · {String(event.detail.found)}
                      </span>
                    ) : null}
                    {typeof event.detail?.error === "string" ? (
                      <span className="text-destructive mt-0.5 block truncate text-xs">
                        {event.detail.error}
                      </span>
                    ) : null}
                  </span>
                  <time className="text-muted-foreground/60 shrink-0 font-mono text-[10px]">
                    {clockOf(event.at)}
                  </time>
                </li>
              ))
            )}
          </ol>
        </section>

        <section className="flex flex-col items-center justify-center gap-4 px-6 py-8">
          <EngineNetwork segments={segments} running={running} total={total} />

          {summary ? (
            <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-center">
              {(mode === "dry"
                ? [
                    ["Candidatas", summary.candidates],
                    ["Nuevas", summary.wouldInsert],
                    ["Conocidas", summary.alreadyKnown],
                  ]
                : [
                    ["Insertadas", summary.inserted],
                    ["Duplicadas", summary.duplicatesRemoved],
                    ["Segundos", Math.round((summary.durationMs ?? 0) / 100) / 10],
                  ]
              ).map(([label, value]) => (
                <div key={String(label)}>
                  <dd className="text-xl font-semibold tabular-nums">{String(value ?? 0)}</dd>
                  <dt className="text-muted-foreground text-[10px] tracking-wider uppercase">
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
          ) : null}

          {mode === "dry" && summary ? (
            <p className="text-muted-foreground text-xs">No se escribio nada en la base.</p>
          ) : null}
        </section>

        <section className="p-4">
          <h3 className="text-muted-foreground mb-3 text-[10px] tracking-[0.18em] uppercase">
            Titulares encontrados
          </h3>
          <ol className="max-h-[440px] space-y-2.5 overflow-y-auto pr-1">
            {titles.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                Los titulares aparecen aqui a medida que cada busqueda responde.
              </li>
            ) : (
              titles.map((item, index) => (
                <li key={`${item.title}-${index}`} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <p className="text-sm leading-snug">{item.title}</p>
                </li>
              ))
            )}
          </ol>
        </section>
      </div>

      {error || summary?.routines?.length ? (
        <div className="space-y-2 border-t px-4 py-3">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {summary?.routines?.map((routine) => (
            <p key={routine.routine} className="flex items-center gap-2 text-sm">
              <Badge variant={routine.ok ? "secondary" : "destructive"}>
                {routine.ok ? "rutina ok" : "rutina fallo"}
              </Badge>
              <span>{routine.routine}</span>
              {routine.error ? (
                <span className="text-destructive truncate text-xs">{routine.error}</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
