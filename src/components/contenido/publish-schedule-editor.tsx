"use client"

import * as React from "react"

import { updatePublishSchedule, type ActionResult } from "@/app/contenido/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PublishSchedule } from "@/engine/publish/schedule"
import { ClockIcon } from "lucide-react"

/**
 * Cuando y cuanto se publica, por red.
 *
 * Cada red va por su cuenta: se puede tener LinkedIn publicando a diario y
 * Instagram parado, o repartir el dia en tandas distintas.
 */
export function PublishScheduleEditor({
  schedules,
  timezone,
  horaActual,
  proximas,
  disponibles,
  linkedinConectado,
}: {
  schedules: PublishSchedule[]
  timezone: string
  horaActual: number
  /** Proximas tandas por red, ya calculadas en el servidor. */
  proximas: Record<string, string[]>
  /** Piezas listas para publicar por red, para que el numero no sea abstracto. */
  disponibles: Record<string, number>
  linkedinConectado: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockIcon className="size-4" />
          Publicacion automatica
        </CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          A que horas se publica y cuantas piezas por tanda. Si no hay tantas listas, se publica
          lo que haya. Las horas son de {timezone}.
        </p>
      </CardHeader>

      <CardContent className="space-y-8">
        {schedules.map((schedule) => (
          <RedProgramada
            key={schedule.network}
            schedule={schedule}
            horaActual={horaActual}
            proximas={proximas[schedule.network] ?? []}
            disponibles={disponibles[schedule.network] ?? 0}
            aviso={
              schedule.network === "instagram"
                ? "Publicar en Instagram aun no esta construido: el horario se guarda, pero no publicara nada todavia."
                : !linkedinConectado
                  ? "No hay ninguna cuenta de LinkedIn conectada, asi que no se publicara nada."
                  : null
            }
          />
        ))}
      </CardContent>
    </Card>
  )
}

function RedProgramada({
  schedule,
  horaActual,
  proximas,
  disponibles,
  aviso,
}: {
  schedule: PublishSchedule
  horaActual: number
  proximas: string[]
  disponibles: number
  aviso: string | null
}) {
  const [enabled, setEnabled] = React.useState(schedule.enabled)
  const [horas, setHoras] = React.useState<number[]>(schedule.run_hours)
  const [minuto, setMinuto] = React.useState(String(schedule.run_minute))
  const [tanda, setTanda] = React.useState(String(schedule.batch_size))
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const toggleHora = (hora: number) => {
    setResult(null)
    setHoras((actual) =>
      actual.includes(hora)
        ? actual.filter((h) => h !== hora)
        : [...actual, hora].sort((a, b) => a - b)
    )
  }

  const dirty =
    enabled !== schedule.enabled ||
    minuto.trim() !== String(schedule.run_minute) ||
    tanda.trim() !== String(schedule.batch_size) ||
    horas.join(",") !== schedule.run_hours.join(",")

  const save = () => {
    const form = new FormData()
    form.set("network", schedule.network)
    form.set("enabled", enabled ? "true" : "false")
    form.set("run_hours", horas.join(","))
    form.set("run_minute", minuto.trim() || "0")
    form.set("batch_size", tanda.trim() || "1")

    setResult(null)
    startTransition(async () => setResult(await updatePublishSchedule(form)))
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold capitalize">{schedule.network}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {disponibles > 0
              ? `${disponibles} ${disponibles === 1 ? "pieza lista" : "piezas listas"} para publicar`
              : "sin piezas listas ahora mismo"}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setResult(null)
            setEnabled(Boolean(v))
          }}
          aria-label={`Publicacion automatica en ${schedule.network}`}
        />
      </div>

      {aviso ? <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p> : null}

      <div className="grid gap-2">
        <Label>Horas de las tandas</Label>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {Array.from({ length: 24 }, (_, hora) => {
            const on = horas.includes(hora)
            return (
              <button
                key={hora}
                type="button"
                onClick={() => toggleHora(hora)}
                disabled={!enabled}
                aria-pressed={on}
                className={`relative rounded-md border py-2 font-mono text-xs transition-colors disabled:opacity-40 ${
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
                }`}
              >
                {String(hora).padStart(2, "0")}
                {hora === horaActual ? (
                  <span
                    className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          {horas.length === 0
            ? "Sin horas: publica en cuanto haya una pieza lista, sin esperar."
            : `${horas.length} ${horas.length === 1 ? "tanda" : "tandas"} al dia. La barra verde marca la hora actual.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`minuto-${schedule.network}`}>Minuto</Label>
          <Input
            id={`minuto-${schedule.network}`}
            type="number"
            min={0}
            max={59}
            className="w-24 font-mono"
            value={minuto}
            disabled={!enabled || horas.length === 0}
            onChange={(e) => {
              setResult(null)
              setMinuto(e.target.value)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`tanda-${schedule.network}`}>Piezas por tanda</Label>
          <Input
            id={`tanda-${schedule.network}`}
            type="number"
            min={1}
            max={20}
            className="w-24 font-mono"
            value={tanda}
            disabled={!enabled}
            onChange={(e) => {
              setResult(null)
              setTanda(e.target.value)
            }}
          />
        </div>
      </div>

      {enabled && proximas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Proximas:</span>
          {proximas.map((p) => (
            <Badge key={p} variant="secondary">
              {p}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
        {result && !result.ok ? (
          <span className="text-destructive text-sm">{result.error}</span>
        ) : null}
      </div>
    </section>
  )
}
