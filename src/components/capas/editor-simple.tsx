"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { borrarFila, guardarFila, type ActionResult } from "@/app/capas/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Fila = { id: string; name: string; description: string | null }

type Tabla = "content_narratives" | "content_ctas"

/**
 * Lista editable de una capa simple: nombre y descripcion.
 *
 * La descripcion no es adorno: es lo que el agente lee para entender que
 * significa "El error" o "Informar". Por eso cada fila la pide y la muestra
 * entera, no como un tooltip escondido.
 *
 * Se guarda al salir del campo (onBlur), no con un boton por fila: son muchas
 * filas y un boton en cada una llenaria la pantalla de ruido. Lo nuevo si tiene
 * boton, porque hasta que no se crea no hay fila a la que volver.
 */
export function EditorSimple({
  tabla,
  filas,
  titulo,
  descripcion,
  ejemploNombre,
  ejemploDescripcion,
}: {
  tabla: Tabla
  filas: Fila[]
  titulo: string
  descripcion: string
  ejemploNombre: string
  ejemploDescripcion: string
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const guardar = (
    campos: { id?: string; name: string; description?: string | null },
    alTerminar?: () => void
  ) => {
    setError(null)
    startTransition(async () => {
      const r: ActionResult = await guardarFila(tabla, campos)
      if (!r.ok) setError(r.error)
      else alTerminar?.()
    })
  }

  const borrar = (id: string) => {
    setError(null)
    startTransition(async () => {
      const r = await borrarFila(tabla, id)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">{descripcion}</p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {filas.map((f) => (
          <FilaEditable
            key={f.id}
            fila={f}
            disabled={pending}
            onGuardar={(campos) => guardar(campos)}
            onBorrar={() => borrar(f.id)}
          />
        ))}
      </div>

      <NuevaFila
        disabled={pending}
        ejemploNombre={ejemploNombre}
        ejemploDescripcion={ejemploDescripcion}
        onCrear={(campos, limpiar) => guardar(campos, limpiar)}
      />
    </div>
  )
}

function FilaEditable({
  fila,
  disabled,
  onGuardar,
  onBorrar,
}: {
  fila: Fila
  disabled: boolean
  onGuardar: (campos: { id: string; name: string; description: string | null }) => void
  onBorrar: () => void
}) {
  const [name, setName] = React.useState(fila.name)
  const [desc, setDesc] = React.useState(fila.description ?? "")

  const guardarSiCambio = () => {
    if (name.trim() === fila.name && desc.trim() === (fila.description ?? "")) return
    if (!name.trim()) return
    onGuardar({ id: fila.id, name: name.trim(), description: desc.trim() || null })
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={name}
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
            onBlur={guardarSiCambio}
            className="font-medium"
          />
          <Textarea
            value={desc}
            disabled={disabled}
            rows={2}
            placeholder="Como lo entiende el agente…"
            onChange={(e) => setDesc(e.target.value)}
            onBlur={guardarSiCambio}
            className="text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onBorrar}
          aria-label="Borrar"
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function NuevaFila({
  disabled,
  ejemploNombre,
  ejemploDescripcion,
  onCrear,
}: {
  disabled: boolean
  ejemploNombre: string
  ejemploDescripcion: string
  onCrear: (campos: { name: string; description: string | null }, limpiar: () => void) => void
}) {
  const [name, setName] = React.useState("")
  const [desc, setDesc] = React.useState("")

  const crear = () => {
    if (!name.trim()) return
    onCrear({ name: name.trim(), description: desc.trim() || null }, () => {
      setName("")
      setDesc("")
    })
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={name}
            disabled={disabled}
            placeholder={ejemploNombre}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            value={desc}
            disabled={disabled}
            rows={2}
            placeholder={ejemploDescripcion}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <Button
          size="icon"
          disabled={disabled || !name.trim()}
          onClick={crear}
          aria-label="Anadir"
          className="shrink-0"
        >
          <PlusIcon className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
