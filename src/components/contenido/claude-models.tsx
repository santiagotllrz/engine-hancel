"use client"

import * as React from "react"

import { guardarModeloIA } from "@/app/cuenta/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  MODELOS_DISPONIBLES,
  PASOS_IA,
  type ModelosPorPaso,
  type PasoIA,
} from "@/lib/modelos-ia"

/**
 * El modelo que usa cada paso de IA, como en Houston.
 *
 * Global: una sola cuenta de Claude mueve todo. Guarda al cambiar, sin boton.
 */
export function ClaudeModels({ modelos }: { modelos: ModelosPorPaso }) {
  const [valores, setValores] = React.useState<ModelosPorPaso>(modelos)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function cambiar(paso: PasoIA, modelo: string) {
    setError(null)
    setValores((v) => ({ ...v, [paso]: modelo }))
    startTransition(async () => {
      const r = await guardarModeloIA(paso, modelo)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Modelo por paso</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Que modelo de Claude usa cada paso, para <strong>todas las cuentas</strong>. Haiku es
          rapido y barato para analizar en volumen; Sonnet u Opus dan mas calidad al escribir.
        </p>
      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-2">
        {PASOS_IA.map(({ paso, nombre }) => (
          <div key={paso} className="grid gap-1.5">
            <Label htmlFor={`modelo-${paso}`}>{nombre}</Label>
            <select
              id={`modelo-${paso}`}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={valores[paso]}
              disabled={pending}
              onChange={(e) => cambiar(paso, e.target.value)}
            >
              {MODELOS_DISPONIBLES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        ))}
        {error ? <p className="text-destructive text-sm sm:col-span-2">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
