"use client"

import * as React from "react"

import { guardarCanva, guardarPromptsEstudio } from "@/app/recetas/actions"
import type { ConfigEstudio as Config } from "@/lib/recetas-data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * La configuracion de las dos agentes del pipeline nuevo y de Canva.
 *
 * Los prompts son de la cuenta: vacio vuelve al que trae el codigo, que se
 * muestra como punto de partida. La conexion de Canva es una sola para todas
 * las cuentas, como la clave de Composio.
 */
export function ConfigEstudio({ config }: { config: Config }) {
  const [ideas, setIdeas] = React.useState(config.ideasPrompt ?? "")
  const [contenido, setContenido] = React.useState(config.contentPrompt ?? "")
  const [canva, setCanva] = React.useState(config.canvaAccount ?? "")
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  const guardarPrompts = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarPromptsEstudio({ ideas_prompt: ideas, content_prompt: contenido })
      setAviso(r.ok ? { ok: true, texto: "Prompts guardados." } : { ok: false, texto: r.error })
    })
  }

  const guardarConexion = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarCanva(canva)
      setAviso(r.ok ? { ok: true, texto: "Conexion de Canva guardada." } : { ok: false, texto: r.error })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso ? (
        <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de ideas</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Convierte las capas de cada pilar en cartuchos. Se rellena solo cuando a un pilar le
            quedan menos de siete dias de cartuchos segun lo que consumen sus recetas.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="cfg-ideas">Prompt (vacio = el de serie)</Label>
          <Textarea
            id="cfg-ideas"
            rows={8}
            value={ideas}
            disabled={pending}
            placeholder={config.ideasPorDefecto}
            onChange={(e) => setIdeas(e.target.value)}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de contenido</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Toma un cartucho y lo desarrolla en una pieza para el canal y formato de la receta.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="cfg-contenido">Prompt (vacio = el de serie)</Label>
          <Textarea
            id="cfg-contenido"
            rows={8}
            value={contenido}
            disabled={pending}
            placeholder={config.contentPorDefecto}
            onChange={(e) => setContenido(e.target.value)}
            className="font-mono text-xs"
          />
          <div>
            <Button onClick={guardarPrompts} disabled={pending}>
              Guardar prompts
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subgenerador Canva</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Se conecta por Composio. Es el connected account de Canva (empieza por ac_) y sirve a
            todas las cuentas. La clave de Composio es la misma que ya usa el motor.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="cfg-canva">Connected account</Label>
          <div className="flex gap-2">
            <Input
              id="cfg-canva"
              value={canva}
              disabled={pending}
              placeholder="ac_…"
              onChange={(e) => setCanva(e.target.value)}
            />
            <Button onClick={guardarConexion} disabled={pending}>
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
