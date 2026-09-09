"use client"

import * as React from "react"

import { retryJob, runTickNow, type ActionResult } from "@/app/contenido/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { JobAngle, JobLinkedin } from "@/engine/content/types"
import { formatDateTime } from "@/lib/format"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"

/**
 * Los buzones en crudo.
 *
 * Es la pantalla de diagnostico: si una pieza no aparece, aqui se ve si el
 * trabajo sigue esperando a la rutina, si la rutina lo marco fallido, o si la
 * respuesta llego con una forma que el codigo no supo leer.
 */
export function QueuePanel({
  angle,
  linkedin,
}: {
  angle: JobAngle[]
  linkedin: JobLinkedin[]
}) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setResult(null)
            startTransition(async () => setResult(await runTickNow()))
          }}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          {pending ? "Revisando…" : "Revisar la cola ahora"}
        </Button>
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {result?.ok
            ? "Cola revisada."
            : result && !result.ok
              ? result.error
              : "Lo mismo que hacen los avisos de Postgres, a mano."}
        </p>
      </div>

      <QueueSection titulo="Angulos" tabla="jobs_angle" jobs={angle} />
      <QueueSection titulo="Posts de LinkedIn" tabla="jobs_linkedin" jobs={linkedin} />
    </div>
  )
}

function QueueSection({
  titulo,
  tabla,
  jobs,
}: {
  titulo: string
  tabla: "jobs_angle" | "jobs_linkedin"
  jobs: (JobAngle | JobLinkedin)[]
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">
        {titulo}{" "}
        <span className="text-muted-foreground text-sm font-normal">({jobs.length})</span>
      </h2>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            La cola esta vacia.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} tabla={tabla} />
          ))}
        </div>
      )}
    </section>
  )
}

function estadoVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "done") return "default"
  if (status === "failed") return "destructive"
  if (status === "processing") return "outline"
  return "secondary"
}

function JobRow({
  job,
  tabla,
}: {
  job: JobAngle | JobLinkedin
  tabla: "jobs_angle" | "jobs_linkedin"
}) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [abierto, setAbierto] = React.useState(false)

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={estadoVariant(job.status)}>{job.status}</Badge>
            {job.consumed_at ? <Badge variant="outline">consumido</Badge> : null}
            <span className="text-muted-foreground font-mono text-xs">
              {job.id.slice(0, 8)}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">{formatDateTime(job.created_at)}</span>
        </div>

        {job.error ? <p className="text-destructive text-xs">{job.error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Ocultar" : "Ver datos"}
          </Button>
          {job.status === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const result = await retryJob(tabla, job.id)
                  if (!result.ok) setError(result.error)
                })
              }}
            >
              {pending ? "Reintentando…" : "Reintentar"}
            </Button>
          ) : null}
          {error ? <span className="text-destructive text-xs">{error}</span> : null}
        </div>

        {abierto ? (
          <div className="grid gap-2 md:grid-cols-2">
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-[11px]">
              {JSON.stringify(job.input, null, 2)}
            </pre>
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-[11px]">
              {job.respuesta ? JSON.stringify(job.respuesta, null, 2) : "sin respuesta todavia"}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
