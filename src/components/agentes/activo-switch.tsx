"use client"

import * as React from "react"

import { guardarActivo, type ActionResult } from "@/app/agentes/actions"
import { Switch } from "@/components/ui/switch"

/**
 * Pone o quita de servicio al agente.
 *
 * No es lo mismo que el modo. "Manual" quiere decir que lo disparas tu;
 * apagado quiere decir que ese paso no existe para esta cuenta: no corre, y su
 * columna desaparece del estudio. Sin la distincion, la unica forma de no
 * publicar en una red era dejarla en manual y no pulsar nunca, con la columna
 * ocupando sitio para siempre.
 */
export function ActivoSwitch({
  clave,
  activo,
  soloLectura = false,
}: {
  clave: string
  activo: boolean
  soloLectura?: boolean
}) {
  const [encendido, setEncendido] = React.useState(activo)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const cambiar = (v: boolean) => {
    if (soloLectura) return
    setError(null)
    setEncendido(v)
    startTransition(async () => {
      const r: ActionResult = await guardarActivo(clave, v)
      if (!r.ok) {
        setError(r.error)
        setEncendido(!v)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
      <span className="text-muted-foreground text-xs">{encendido ? "En servicio" : "Apagado"}</span>
      <Switch
        checked={encendido}
        disabled={soloLectura || pending}
        onCheckedChange={(v) => cambiar(Boolean(v))}
        aria-label="Agente en servicio"
      />
    </div>
  )
}
