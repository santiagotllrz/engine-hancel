"use client"

import * as React from "react"

import { updateGenerationConfig, type ActionResult } from "@/app/contenido/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { GenerationConfig } from "@/engine/content/types"
// Las mismas listas que valida el servidor al guardar: la interfaz no puede
// ofrecer un valor que la accion vaya a rechazar. El modulo solo tiene
// constantes y tipos, asi que se puede importar desde el cliente.
import { IDIOMAS, LONGITUDES, TONOS } from "@/engine/content/variables"
import { formatNumber } from "@/lib/format"

/**
 * Las ranuras que rellenan el prompt base de la rutina.
 *
 * No son instrucciones libres: son valores acotados que encajan en huecos que
 * el prompt ya dejo abiertos. El texto del prompt no vive aqui ni se puede
 * editar desde la interfaz.
 */
export function GenerationConfigEditor({
  config,
  distribution,
}: {
  config: GenerationConfig
  /** Cuantas analizadas hay por cada umbral, para elegirlo con datos. */
  distribution: { score: number; count: number }[]
}) {
  const [variables, setVariables] = React.useState(config.variables)
  const [umbral, setUmbral] = React.useState(
    config.score_threshold === null ? "" : String(config.score_threshold)
  )
  const [auto, setAuto] = React.useState(config.generation_mode === "auto")
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const set = (clave: keyof typeof variables, valor: string) => {
    setResult(null)
    setVariables((actual) => ({ ...actual, [clave]: valor }))
  }

  const afectadas = distribution.find((d) => String(d.score) === umbral.trim())?.count ?? null

  const save = () => {
    const form = new FormData()
    for (const [clave, valor] of Object.entries(variables)) form.set(clave, valor)
    form.set("score_threshold", umbral.trim())
    form.set("generation_mode", auto ? "auto" : "manual")

    setResult(null)
    startTransition(async () => setResult(await updateGenerationConfig(form)))
  }

  const dirty =
    auto !== (config.generation_mode === "auto") ||
    umbral.trim() !== (config.score_threshold === null ? "" : String(config.score_threshold)) ||
    JSON.stringify(variables) !== JSON.stringify(config.variables)

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Variables de la marca</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Se guardan una vez y se inyectan en cada generacion. El criterio editorial y la
            estructura del post viven en la rutina, no aqui.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Selector
              label="Tono"
              value={variables.tono}
              options={[...TONOS]}
              onChange={(v) => set("tono", v)}
            />
            <Selector
              label="Longitud"
              value={variables.longitud}
              options={[...LONGITUDES]}
              onChange={(v) => set("longitud", v)}
            />
            <Selector
              label="Idioma"
              value={variables.idioma}
              options={[...IDIOMAS]}
              onChange={(v) => set("idioma", v)}
            />
          </div>

          <Campo
            id="audiencia"
            label="Audiencia"
            hint="Ej: founders early-stage LATAM"
            value={variables.audiencia}
            onChange={(v) => set("audiencia", v)}
          />
          <Campo
            id="voz_marca"
            label="Voz de marca"
            hint="Ej: primera persona plural, somos una agencia"
            value={variables.voz_marca}
            onChange={(v) => set("voz_marca", v)}
          />
          <Campo
            id="cta"
            label="Llamada a la accion"
            hint="Ej: invitar a agendar demo"
            value={variables.cta}
            onChange={(v) => set("cta", v)}
          />
          <Campo
            id="evitar"
            label="Evitar"
            hint="Ej: no mencionar competidores"
            value={variables.evitar}
            onChange={(v) => set("evitar", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">Seleccion de noticias</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              En automatico, una noticia que supere el umbral arranca el pipeline sola. En
              manual, tu eliges cuales.
            </p>
          </div>
          <Switch
            checked={auto}
            onCheckedChange={(checked) => {
              setResult(null)
              setAuto(Boolean(checked))
            }}
            aria-label="Activar el modo automatico"
          />
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
                  Sin definir: el modo automatico no seleccionara ninguna noticia. El envio
                  manual sigue disponible siempre.
                </>
              ) : afectadas !== null ? (
                <>
                  Hay <strong>{formatNumber(afectadas)}</strong> noticias analizadas que superan
                  este umbral. El modo automatico las va tomando poco a poco, no todas de golpe.
                </>
              ) : (
                <>El umbral va de 0 a 10, la misma escala que usa la rutina de analisis.</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={pending || !dirty}>
              {pending ? "Guardando…" : "Guardar configuracion"}
            </Button>
            {result?.ok ? (
              <span className="text-sm text-emerald-600">Configuracion guardada.</span>
            ) : null}
            {result && !result.ok ? (
              <span className="text-destructive text-sm">{result.error}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => onChange(opcion)}
            aria-pressed={value === opcion}
            className={`rounded-md border px-2.5 py-1.5 text-xs capitalize transition-colors ${
              value === opcion
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent border-input"
            }`}
          >
            {opcion}
          </button>
        ))}
      </div>
    </div>
  )
}

function Campo({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        maxLength={240}
        placeholder={hint}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
