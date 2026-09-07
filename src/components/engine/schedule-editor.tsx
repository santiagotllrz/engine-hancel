"use client"

import * as React from "react"

import { updateSchedule, type ActionResult } from "@/app/engine/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { EngineSettings } from "@/engine/schedule"
import { ClockIcon } from "lucide-react"

const ZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "UTC",
]

export function ScheduleEditor({
  settings,
  nextRuns,
  currentHour,
}: {
  settings: EngineSettings
  nextRuns: string[]
  currentHour: number
}) {
  const [hours, setHours] = React.useState<number[]>(settings.run_hours)
  const [minute, setMinute] = React.useState(String(settings.run_minute))
  const [enabled, setEnabled] = React.useState(settings.enabled)
  const [timezone, setTimezone] = React.useState(settings.timezone)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const toggleHour = (hour: number) => {
    setResult(null)
    setHours((current) =>
      current.includes(hour)
        ? current.filter((value) => value !== hour)
        : [...current, hour].sort((a, b) => a - b)
    )
  }

  const save = () => {
    const form = new FormData()
    form.set("run_hours", hours.join(","))
    form.set("run_minute", minute.trim() || "0")
    form.set("timezone", timezone)
    form.set("enabled", enabled ? "true" : "false")

    setResult(null)
    startTransition(async () => setResult(await updateSchedule(form)))
  }

  const dirty =
    enabled !== settings.enabled ||
    timezone !== settings.timezone ||
    (minute.trim() || "0") !== String(settings.run_minute) ||
    hours.join(",") !== settings.run_hours.join(",")

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">Programacion automatica</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              pg_cron dispara el motor a estas horas exactas. Al guardar se reprograma solo,
              sin volver a desplegar.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setResult(null)
              setEnabled(Boolean(checked))
            }}
            aria-label="Activar programacion automatica"
          />
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label>Horas de ejecucion</Label>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {Array.from({ length: 24 }, (_, hour) => {
                const on = hours.includes(hour)
                const now = hour === currentHour
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => toggleHour(hour)}
                    disabled={!enabled}
                    aria-pressed={on}
                    className={`relative rounded-md border py-2 font-mono text-xs transition-colors disabled:opacity-40 ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent border-input"
                    }`}
                  >
                    {String(hour).padStart(2, "0")}
                    {now ? (
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
              La barra verde marca la hora actual en {timezone}. Selecciona las horas locales
              en las que quieres traer noticias nuevas.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="run_minute">Minuto</Label>
            <Input
              id="run_minute"
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              className="w-24 font-mono"
              value={minute}
              disabled={!enabled}
              onChange={(event) => {
                setResult(null)
                setMinute(event.target.value)
              }}
            />
            <p className="text-muted-foreground text-xs">
              Se aplica a todas las horas elegidas: con 30, las 05 y las 11 corren a las 05:30
              y a las 11:30.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <Input
              id="timezone"
              value={timezone}
              disabled={!enabled}
              onChange={(event) => {
                setResult(null)
                setTimezone(event.target.value)
              }}
              list="zonas"
            />
            <datalist id="zonas">
              {ZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={pending || !dirty}>
              {pending ? "Guardando…" : "Guardar horario"}
            </Button>
            {result?.ok ? (
              <span className="text-sm text-emerald-600">Horario guardado.</span>
            ) : null}
            {result && !result.ok ? (
              <span className="text-destructive text-sm">{result.error}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClockIcon className="size-4" />
            Proximas ejecuciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextRuns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {settings.enabled
                ? "No hay horas configuradas."
                : "La programacion automatica esta desactivada. El motor solo correra cuando lo lances a mano."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextRuns.map((run) => (
                <Badge key={run} variant="secondary">
                  {run}
                </Badge>
              ))}
            </div>
          )}
          {dirty ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Esta lista refleja lo guardado, no los cambios sin guardar.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
