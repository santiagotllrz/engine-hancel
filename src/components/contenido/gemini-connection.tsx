"use client"

import * as React from "react"

import {
  guardarTokenGemini,
  probarConexionGemini,
  type EstadoTokenGemini,
} from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function GeminiConnection({ estado }: { estado: EstadoTokenGemini }) {
  const [valor, setValor] = React.useState("")
  const [guardando, guardar] = React.useTransition()
  const [probando, probar] = React.useTransition()
  const [guardado, setGuardado] = React.useState<
    { ok: true } | { ok: false; error: string } | null
  >(null)
  const [prueba, setPrueba] = React.useState<
    { ok: true; modelo: string } | { ok: false; error: string } | null
  >(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conexión con Gemini · Google AI</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          La API Key de Google AI Studio. Si configuras Gemini como el proveedor para un agente en la sección inferior, usará esta llave.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {estado.configurado ? (
          <p className="text-sm">
            Conectado:{" "}
            <code className="text-[11px]">{estado.vistaPrevia}</code>
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-400 text-sm">
            Sin llave configurada (si usas Gemini, fallará).
          </p>
        )}

        <div className="grid gap-2">
          <Label htmlFor="gemini_token">
            {estado.configurado ? "Reemplazar API Key" : "Pegar API Key"}
          </Label>
          <Input
            id="gemini_token"
            type="password"
            className="max-w-md font-mono"
            placeholder="AIzaSy..."
            value={valor}
            onChange={(event) => {
              setGuardado(null)
              setPrueba(null)
              setValor(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Obtén tu API Key gratuita en Google AI Studio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={guardando || valor.trim().length === 0}
            onClick={() =>
              guardar(async () => {
                const r = await guardarTokenGemini(valor)
                setGuardado(r)
                if (r.ok) setValor("")
              })
            }
          >
            {guardando ? "Guardando…" : "Guardar llave"}
          </Button>

          <Button
            variant="outline"
            disabled={probando || !estado.configurado}
            onClick={() => probar(async () => setPrueba(await probarConexionGemini()))}
          >
            {probando ? "Probando…" : "Probar conexión"}
          </Button>

          {guardado?.ok ? <span className="text-sm text-emerald-600">Llave guardada.</span> : null}
          {guardado && !guardado.ok ? (
            <span className="text-destructive text-sm">{guardado.error}</span>
          ) : null}
          {prueba?.ok ? (
            <span className="text-sm text-emerald-600">Conexión OK ({prueba.modelo}).</span>
          ) : null}
          {prueba && !prueba.ok ? (
            <span className="text-destructive text-sm">{prueba.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
