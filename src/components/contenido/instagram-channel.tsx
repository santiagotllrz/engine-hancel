"use client"

import * as React from "react"

import { guardarCanalInstagram } from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * El canal de Instagram en el que publica esta cuenta.
 *
 * La conexion con Instagram vive en Buffer y no se toca desde aqui: lo unico que
 * hace falta es decir en cual de los canales ya conectados publica esta cuenta.
 */
export function InstagramChannel({
  canal,
  nombreCuenta,
}: {
  canal: string | null
  nombreCuenta: string
}) {
  const [valor, setValor] = React.useState(canal ?? "")
  const [pending, startTransition] = React.useTransition()
  const [resultado, setResultado] = React.useState<
    { ok: true } | { ok: false; error: string } | null
  >(null)

  const dirty = valor.trim() !== (canal ?? "")

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Instagram</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          En que canal de Buffer publica <strong>{nombreCuenta}</strong>. La cuenta ya esta
          conectada en Buffer; aqui solo se elige cual de ellas es esta.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="buffer_channel_id">Id del canal</Label>
          <Input
            id="buffer_channel_id"
            className="max-w-sm font-mono"
            placeholder="sin configurar"
            value={valor}
            onChange={(event) => {
              setResultado(null)
              setValor(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Es la parte que aparece en la URL del canal en Buffer:{" "}
            <code className="text-[11px]">publish.buffer.com/channels/</code>
            <strong>&lt;id&gt;</strong>
            <code className="text-[11px]">/schedule</code>. Sin esto no se publica en
            Instagram.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || !dirty}
            onClick={() =>
              startTransition(async () => setResultado(await guardarCanalInstagram(valor)))
            }
          >
            {pending ? "Guardando…" : "Guardar canal"}
          </Button>
          {resultado?.ok ? <span className="text-sm text-emerald-600">Canal guardado.</span> : null}
          {resultado && !resultado.ok ? (
            <span className="text-destructive text-sm">{resultado.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
