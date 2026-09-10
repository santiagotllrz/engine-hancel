"use client"

import * as React from "react"

import { updateBufferChannel, type ActionResult } from "@/app/contenido/actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BufferChannel } from "@/engine/publish/buffer"
import { SendIcon } from "lucide-react"

/**
 * El canal de Buffer en el que se publica Instagram.
 *
 * Hay que elegirlo y no adivinarlo: una misma cuenta puede tener varios canales
 * conectados con el mismo nombre, y publicar en el que no toca no tiene desHacer.
 */
export function BufferChannelPicker({
  canales,
  elegido,
  configurado,
  error,
}: {
  canales: BufferChannel[]
  elegido: string | null
  configurado: boolean
  /** Si listar los canales fallo, para decirlo en vez de mostrar una lista vacia. */
  error: string | null
}) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)
  const [seleccion, setSeleccion] = React.useState(elegido ?? "")

  const elegir = (id: string) => {
    setSeleccion(id)
    setResult(null)
    startTransition(async () => setResult(await updateBufferChannel(id)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SendIcon className="size-4" />
          Instagram via Buffer
        </CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Los carruseles se publican a traves de Buffer, que ya tiene resuelta la conexion con
          Instagram.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {!configurado ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Falta <code className="text-xs">BUFFER_API_KEY</code> en el entorno.
          </p>
        ) : error ? (
          <p className="text-destructive text-sm">No se pudieron leer los canales: {error}</p>
        ) : canales.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Buffer no devuelve ningun canal. Conecta una cuenta de Instagram en Buffer primero.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {canales.map((canal) => (
              <button
                key={canal.id}
                type="button"
                disabled={pending}
                onClick={() => elegir(canal.id)}
                aria-pressed={seleccion === canal.id}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                  seleccion === canal.id
                    ? "border-primary ring-primary ring-1"
                    : "hover:bg-accent border-input"
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{canal.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {canal.service} · {canal.id.slice(0, 10)}…
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {canal.isQueuePaused ? <Badge variant="outline">cola en pausa</Badge> : null}
                  {seleccion === canal.id ? <Badge>elegido</Badge> : null}
                </span>
              </button>
            ))}

            {canales.length > 1 ? (
              <p className="text-muted-foreground text-xs">
                Hay {canales.length} canales conectados. Si comparten nombre, mira el
                identificador para distinguirlos.
              </p>
            ) : null}
          </div>
        )}

        <p role="status" aria-live="polite" className="text-sm">
          {result?.ok ? (
            <span className="text-emerald-600">Canal guardado.</span>
          ) : result && !result.ok ? (
            <span className="text-destructive">{result.error}</span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  )
}
