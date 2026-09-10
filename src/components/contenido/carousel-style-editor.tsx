"use client"

import * as React from "react"

import { updateCarouselStyle, type ActionResult } from "@/app/contenido/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { FUENTES, PALETAS, type Estilo } from "@/engine/render/theme"

/**
 * El aspecto de las imagenes del carrusel.
 *
 * Cambia lo que se ve, no lo que se dice: el texto lo escribe la rutina y estas
 * son las decisiones visuales de quien publica.
 */
export function CarouselStyleEditor({
  estilo,
  paletaActual,
  pexelsConfigurado,
}: {
  estilo: Estilo
  paletaActual: string
  pexelsConfigurado: boolean
}) {
  const [paleta, setPaleta] = React.useState(paletaActual)
  const [fuente, setFuente] = React.useState(estilo.fuente)
  const [marca, setMarca] = React.useState(estilo.marca)
  const [paginacion, setPaginacion] = React.useState(estilo.mostrarPaginacion)
  const [usarFotos, setUsarFotos] = React.useState(estilo.usarFotos)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const dirty =
    paleta !== paletaActual ||
    fuente !== estilo.fuente ||
    marca !== estilo.marca ||
    paginacion !== estilo.mostrarPaginacion ||
    usarFotos !== estilo.usarFotos

  const save = () => {
    const form = new FormData()
    form.set("paleta", paleta)
    form.set("fuente", fuente)
    form.set("marca", marca)
    form.set("mostrarPaginacion", paginacion ? "true" : "false")
    form.set("usarFotos", usarFotos ? "true" : "false")

    setResult(null)
    startTransition(async () => setResult(await updateCarouselStyle(form)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aspecto del carrusel</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Las imagenes de Instagram. Puedes ver cualquier cambio antes de generar nada en{" "}
          <a href="/api/render/preview" target="_blank" rel="noreferrer" className="underline">
            la previsualizacion
          </a>
          .
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-1.5">
          <Label>Paleta</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PALETAS).map(([nombre, valores]) => (
              <button
                key={nombre}
                type="button"
                onClick={() => {
                  setResult(null)
                  setPaleta(nombre)
                }}
                aria-pressed={paleta === nombre}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs capitalize transition-colors ${
                  paleta === nombre ? "border-primary ring-primary ring-1" : "border-input"
                }`}
              >
                <span
                  className="size-4 rounded-full border"
                  style={{ background: valores.fondo }}
                />
                <span className="size-4 rounded-full" style={{ background: valores.acento }} />
                {nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Tipografia</Label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(FUENTES).map((nombre) => (
              <button
                key={nombre}
                type="button"
                onClick={() => {
                  setResult(null)
                  setFuente(nombre as typeof fuente)
                }}
                aria-pressed={fuente === nombre}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  fuente === nombre
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent border-input"
                }`}
              >
                {nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="marca">Rotulo de la esquina</Label>
          <Input
            id="marca"
            maxLength={40}
            placeholder="vacio = sin rotulo"
            value={marca}
            onChange={(event) => {
              setResult(null)
              setMarca(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Aparece arriba en cada lamina. Dejalo vacio y las imagenes salen sin marca.
          </p>
        </div>

        <div className="flex items-start justify-between gap-3 border-t pt-4">
          <div>
            <Label htmlFor="paginacion">Numerar las laminas</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              El &ldquo;1 / 5&rdquo; y el &ldquo;desliza&rdquo; del pie.
            </p>
          </div>
          <Switch
            id="paginacion"
            checked={paginacion}
            onCheckedChange={(v) => {
              setResult(null)
              setPaginacion(Boolean(v))
            }}
            aria-label="Numerar las laminas"
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="usarFotos">Fotos de banco en las laminas</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              {pexelsConfigurado ? (
                <>
                  Busca en Pexels por el tema concreto de la noticia, no por su nicho. Apagado,
                  las laminas interiores son solo tipografia.
                </>
              ) : (
                <>
                  Falta <code className="text-xs">PEXELS_API_KEY</code> en el entorno: las
                  laminas saldran sin fotos.
                </>
              )}
            </p>
          </div>
          <Switch
            id="usarFotos"
            checked={usarFotos && pexelsConfigurado}
            disabled={!pexelsConfigurado}
            onCheckedChange={(v) => {
              setResult(null)
              setUsarFotos(Boolean(v))
            }}
            aria-label="Usar fotos de banco"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Guardando…" : "Guardar aspecto"}
          </Button>
          {result?.ok ? <span className="text-sm text-emerald-600">Aspecto guardado.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
