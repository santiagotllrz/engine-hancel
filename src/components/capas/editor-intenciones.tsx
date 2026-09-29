"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { alternarNarrativa, borrarFila, guardarFila } from "@/app/capas/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Fila = { id: string; name: string; description: string | null }
type Intencion = Fila & { narrativas: string[] }

/**
 * Las intenciones, y que narrativas desbloquea cada una.
 *
 * La intencion es el proposito ("Informar", "Advertir"); la narrativa, la forma
 * ("El Dato", "El error"). No todas las formas sirven a todo proposito, asi que
 * cada intencion marca las suyas: al generar, elegir una intencion deja
 * disponibles solo esas. Si no hay narrativas creadas todavia, primero se crean
 * en su pestana.
 */
export function EditorIntenciones({
  intenciones,
  narrativas,
}: {
  intenciones: Intencion[]
  narrativas: Fila[]
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [nuevoNombre, setNuevoNombre] = React.useState("")
  const [nuevaDesc, setNuevaDesc] = React.useState("")

  const accion = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Algo fallo.")
    })
  }

  const crear = () => {
    if (!nuevoNombre.trim()) return
    accion(async () => {
      const r = await guardarFila("content_intents", {
        name: nuevoNombre.trim(),
        description: nuevaDesc.trim() || null,
      })
      if (r.ok) {
        setNuevoNombre("")
        setNuevaDesc("")
      }
      return r
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Intenciones</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          El proposito del contenido. Cada una desbloquea las narrativas con las que se puede
          contar.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {narrativas.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-sm">
          Aun no hay narrativas. Crealas en su pestana para poder enlazarlas aqui.
        </p>
      ) : null}

      {intenciones.map((i) => (
        <Card key={i.id}>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-start gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <CampoNombre
                  valor={i.name}
                  disabled={pending}
                  onGuardar={(name) => accion(() => guardarFila("content_intents", { id: i.id, name, description: i.description }))}
                />
                <CampoDescripcion
                  valor={i.description ?? ""}
                  disabled={pending}
                  onGuardar={(description) =>
                    accion(() => guardarFila("content_intents", { id: i.id, name: i.name, description }))
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() => accion(() => borrarFila("content_intents", i.id))}
                aria-label="Borrar"
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>

            {narrativas.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">Narrativas que desbloquea</span>
                <div className="flex flex-wrap gap-1.5">
                  {narrativas.map((n) => {
                    const activa = i.narrativas.includes(n.id)
                    return (
                      <button
                        key={n.id}
                        type="button"
                        disabled={pending}
                        onClick={() => accion(() => alternarNarrativa(i.id, n.id, !activa))}
                        aria-pressed={activa}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          activa
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent border-input"
                        }`}
                      >
                        {n.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-3">
          <div className="flex flex-1 flex-col gap-2">
            <Input
              value={nuevoNombre}
              disabled={pending}
              placeholder="Nueva intencion: Informar, Advertir, Ensenar…"
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
            <Textarea
              value={nuevaDesc}
              disabled={pending}
              rows={2}
              placeholder="Que busca esta intencion, para que el agente la entienda…"
              onChange={(e) => setNuevaDesc(e.target.value)}
            />
          </div>
          <Button size="icon" disabled={pending || !nuevoNombre.trim()} onClick={crear} className="shrink-0">
            <PlusIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function CampoNombre({
  valor,
  disabled,
  onGuardar,
}: {
  valor: string
  disabled: boolean
  onGuardar: (name: string) => void
}) {
  const [texto, setTexto] = React.useState(valor)
  // Ajuste durante render, no en efecto: cuando la fila se guarda y vuelve del
  // servidor con el valor nuevo, el input se sincroniza sin el setState-en-efecto
  // que el compilador rechaza.
  const [previo, setPrevio] = React.useState(valor)
  if (valor !== previo) {
    setPrevio(valor)
    setTexto(valor)
  }
  return (
    <Input
      value={texto}
      disabled={disabled}
      className="font-medium"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const l = texto.trim()
        if (l && l !== valor) onGuardar(l)
        else setTexto(valor)
      }}
    />
  )
}

function CampoDescripcion({
  valor,
  disabled,
  onGuardar,
}: {
  valor: string
  disabled: boolean
  onGuardar: (description: string | null) => void
}) {
  const [texto, setTexto] = React.useState(valor)
  // Ajuste durante render, no en efecto: cuando la fila se guarda y vuelve del
  // servidor con el valor nuevo, el input se sincroniza sin el setState-en-efecto
  // que el compilador rechaza.
  const [previo, setPrevio] = React.useState(valor)
  if (valor !== previo) {
    setPrevio(valor)
    setTexto(valor)
  }
  return (
    <Textarea
      value={texto}
      disabled={disabled}
      rows={2}
      placeholder="Como lo entiende el agente…"
      className="text-sm"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto.trim() !== valor) onGuardar(texto.trim() || null)
      }}
    />
  )
}
