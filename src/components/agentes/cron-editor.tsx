"use client"

import * as React from "react"

import { guardarHorario, guardarModo, type ActionResult } from "@/app/agentes/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EXPLICACION_MODO } from "@/lib/agentes-catalogo"

type Modo = "manual" | "programado" | "automatico"

const NOMBRE: Record<Modo, string> = {
  manual: "Manual",
  programado: "Programado",
  automatico: "Automatico",
}

/**
 * Cuando corre un agente.
 *
 * Los tres modos se enseñan como tres opciones al mismo nivel, no como un
 * interruptor con ajustes: antes "automatico" queria decir dos cosas distintas
 * —a una hora, o en cuanto llega el trabajo— y nadie podia saber cual sin leer
 * el codigo. Cada uno lleva su frase explicandose.
 */
export function CronEditor({
  clave,
  modos,
  modo,
  horas,
  minuto,
  canal = "",
  titulo = "Cron",
  proximas,
  soloLectura = false,
}: {
  clave: string
  modos: Modo[]
  modo: Modo
  horas: number[]
  minuto: number
  canal?: string
  titulo?: string
  /** Las proximas pasadas previstas, ya calculadas en el servidor. */
  proximas: string[]
  soloLectura?: boolean
}) {
  const [elegido, setElegido] = React.useState<Modo>(modo)
  const [texto, setTexto] = React.useState(horas.join(", "))
  const [min, setMin] = React.useState(String(minuto))
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const cambiarModo = (m: Modo) => {
    if (soloLectura) return
    setResult(null)
    setElegido(m)
    startTransition(async () => setResult(await guardarModo(clave, m, canal)))
  }

  const guardarHoras = () => {
    const parsed = texto
      .split(/[,\s]+/)
      .map((t) => Number(t.trim()))
      .filter((n) => !Number.isNaN(n))

    setResult(null)
    startTransition(async () =>
      setResult(await guardarHorario(clave, parsed, Number(min) || 0, canal))
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">{EXPLICACION_MODO[elegido]}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {modos.map((m) => (
            <button
              key={m}
              type="button"
              disabled={soloLectura || pending}
              onClick={() => cambiarModo(m)}
              aria-pressed={elegido === m}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                elegido === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent border-input"
              }`}
            >
              {NOMBRE[m]}
            </button>
          ))}
        </div>

        {elegido === "programado" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`horas-${clave}-${canal}`}>Horas</Label>
              <Input
                id={`horas-${clave}-${canal}`}
                placeholder="9, 13, 18"
                value={texto}
                disabled={soloLectura}
                onChange={(e) => {
                  setResult(null)
                  setTexto(e.target.value)
                }}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`min-${clave}-${canal}`}>Minuto</Label>
              <Input
                id={`min-${clave}-${canal}`}
                className="w-20 font-mono"
                value={min}
                disabled={soloLectura}
                onChange={(e) => {
                  setResult(null)
                  setMin(e.target.value)
                }}
              />
            </div>
            <Button onClick={guardarHoras} disabled={pending || soloLectura}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        ) : null}

        {proximas.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Proximas pasadas: {proximas.join(" · ")}
          </p>
        ) : null}

        {soloLectura ? (
          <p className="text-muted-foreground text-xs">
            Se configura en el agente del que sale. Aqui solo se consulta.
          </p>
        ) : null}

        {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
        {result && !result.ok ? (
          <span className="text-destructive text-sm">{result.error}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
