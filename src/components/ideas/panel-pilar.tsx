"use client"

import * as React from "react"
import { SparklesIcon, Trash2Icon } from "lucide-react"

import { generarIdeas, limpiarDisponibles } from "@/app/ideas/actions"
import type { PilarConIdeas } from "@/lib/ideas-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Los cartuchos de un pilar, y el boton que genera una ronda.
 *
 * Una ronda es una idea por cada combinacion de capas del pilar. Generar puede
 * tardar: recorre todas las combinaciones y las escribe de una en varias
 * llamadas, asi que el boton se queda a la espera y avisa cuando termina.
 */
export function PanelPilar({ pilar }: { pilar: PilarConIdeas }) {
  const [pending, startTransition] = React.useTransition()
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)

  const generar = () => {
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await generarIdeas(pilar.id)
        setAviso(
          r.ok
            ? { ok: true, texto: `Ronda ${r.ronda}: ${r.generadas} ideas nuevas.` }
            : { ok: false, texto: r.error }
        )
      } catch {
        setAviso({ ok: false, texto: "No respondio. Puede haber tardado de mas." })
      }
    })
  }

  const limpiar = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await limpiarDisponibles(pilar.id)
      if (!r.ok) setAviso({ ok: false, texto: r.error })
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">{pilar.name}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            {pilar.disponibles.length} disponibles · {pilar.totalUsados} usadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pilar.disponibles.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              onClick={limpiar}
              title="Borrar los cartuchos disponibles"
              aria-label="Borrar disponibles"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
          <Button disabled={pending} onClick={generar}>
            <SparklesIcon className="size-4" />
            {pending ? "Generando…" : "Generar ronda"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {aviso ? (
          <p className={`mb-3 text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>
            {aviso.texto}
          </p>
        ) : null}

        {pilar.disponibles.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
            Sin cartuchos. Pulsa Generar ronda para que el agente proponga una idea por cada
            combinacion de este pilar.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pilar.disponibles.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{c.idea}</p>
                {c.notes ? <p className="text-muted-foreground mt-1 text-sm">{c.notes}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tema ? <Badge variant="outline">{c.tema}</Badge> : null}
                  {c.subtema ? <Badge variant="outline">{c.subtema}</Badge> : null}
                  {c.intencion ? <Badge variant="secondary">{c.intencion}</Badge> : null}
                  {c.narrativa ? <Badge variant="secondary">{c.narrativa}</Badge> : null}
                  <Badge variant="outline" className="text-muted-foreground">
                    ronda {c.round}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
