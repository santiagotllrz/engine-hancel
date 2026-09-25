"use client"

import * as React from "react"

import { updateGenerationConfig, type ActionResult } from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GenerationConfig } from "@/engine/content/types"
import { formatNumber } from "@/lib/format"

/**
 * A partir de que nota una noticia merece contenido.
 *
 * El interruptor de automatico que acompañaba a esto ya no vive aqui: cada
 * agente tiene su modo, asi que "automatico" dejo de ser una sola cosa. Lo que
 * queda es la decision que si es de la cuenta entera y no de ningun agente en
 * concreto: donde esta el liston.
 */
export function SeleccionDeNoticias({
  config,
  distribution,
}: {
  config: GenerationConfig
  /** Cuantas analizadas hay por cada umbral, para elegirlo con datos. */
  distribution: { score: number; count: number }[]
}) {
  const inicial = config.score_threshold === null ? "" : String(config.score_threshold)
  const [umbral, setUmbral] = React.useState(inicial)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const afectadas = distribution.find((d) => String(d.score) === umbral.trim())?.count ?? null
  const dirty = umbral.trim() !== inicial

  const save = () => {
    const form = new FormData()
    // Las variables de marca comparten accion y se editan en Marca: si no
    // viajan, la accion las leeria vacias y las borraria de paso.
    for (const [clave, valor] of Object.entries(config.variables)) form.set(clave, valor)
    form.set("score_threshold", umbral.trim())

    setResult(null)
    startTransition(async () => setResult(await updateGenerationConfig(form)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Seleccion de noticias</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          El liston que una noticia analizada tiene que pasar para que el agente de angulo la
          tome. Por debajo del umbral sigue estando: se puede empujar a mano arrastrandola en
          el estudio, y queda anotado que entro sin llegar.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="score_threshold">Umbral de score</Label>
          <Input
            id="score_threshold"
            type="number"
            min={0}
            max={10}
            inputMode="numeric"
            placeholder="sin definir"
            className="w-32 font-mono"
            value={umbral}
            onChange={(event) => {
              setResult(null)
              setUmbral(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            {umbral.trim() === "" ? (
              <>
                Sin definir: no se selecciona ninguna noticia sola. Arrastrar en el estudio
                sigue funcionando siempre.
              </>
            ) : afectadas !== null ? (
              <>
                Hay <strong>{formatNumber(afectadas)}</strong> noticias analizadas que superan
                este umbral. Se van tomando poco a poco, no todas de golpe.
              </>
            ) : (
              <>El umbral va de 0 a 10, la misma escala que usa el agente de analisis.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
