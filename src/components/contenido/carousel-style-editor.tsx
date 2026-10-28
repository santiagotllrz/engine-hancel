"use client"

import * as React from "react"

import { updateCarouselStyle, type ActionResult } from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { FUENTES, PALETAS, type Estilo, type Plantilla } from "@/engine/render/theme"

/** Los estilos de noticia que se pueden elegir, con lo que los distingue. */
const ESTILOS: { valor: Plantilla; nombre: string; pista: string }[] = [
  { valor: "clasica", nombre: "Clásico", pista: "Foto a sangre con el titular abajo y el nicho encima. El de siempre." },
  { valor: "editorial", nombre: "Editorial", pista: "Limpio sobre blanco: la foto en un bloque, el nicho y un botón, el titular muy grande y el logo en el pie." },
  { valor: "impacto", nombre: "Impacto", pista: "De medio informativo: foto a sangre, el logo en blanco, una barra verde y el titular en mayúsculas." },
  { valor: "periodico", nombre: "Periódico", pista: "La portada de un diario: el logo en negro bajo una raya verde, la foto a lo ancho y el titular serif centrado con el nicho y la fecha." },
]

/**
 * El aspecto de las imagenes del carrusel.
 *
 * Cambia lo que se ve, no lo que se dice: el texto lo escribe el agente y estas
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
  const [plantilla, setPlantilla] = React.useState<Plantilla>(estilo.plantilla)
  // Plogy tiene su plantilla propia: solo se ofrece a la cuenta que ya la usa.
  const estilos = estilo.plantilla === "plogy" ? [...ESTILOS, { valor: "plogy" as const, nombre: "Plogy", pista: "La estructura propia de Plogy." }] : ESTILOS
  const [fuente, setFuente] = React.useState(estilo.fuente)
  const [marca, setMarca] = React.useState(estilo.marca)
  const [paginacion, setPaginacion] = React.useState(estilo.mostrarPaginacion)
  const [usarFotos, setUsarFotos] = React.useState(estilo.usarFotos)
  const [literales, setLiterales] = React.useState(estilo.fotosLiterales)
  const [cierreEstilo, setCierreEstilo] = React.useState(estilo.cierre.estilo)
  const [cierreTitulo, setCierreTitulo] = React.useState(estilo.cierre.titulo)
  const [cierreTexto, setCierreTexto] = React.useState(estilo.cierre.texto)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const dirty =
    plantilla !== estilo.plantilla ||
    paleta !== paletaActual ||
    fuente !== estilo.fuente ||
    marca !== estilo.marca ||
    paginacion !== estilo.mostrarPaginacion ||
    usarFotos !== estilo.usarFotos ||
    literales !== estilo.fotosLiterales ||
    cierreEstilo !== estilo.cierre.estilo ||
    cierreTitulo !== estilo.cierre.titulo ||
    cierreTexto !== estilo.cierre.texto

  const save = () => {
    const form = new FormData()
    form.set("plantilla", plantilla)
    form.set("paleta", paleta)
    form.set("fuente", fuente)
    form.set("marca", marca)
    form.set("mostrarPaginacion", paginacion ? "true" : "false")
    form.set("usarFotos", usarFotos ? "true" : "false")
    form.set("fotosLiterales", literales ? "true" : "false")
    form.set("cierreEstilo", cierreEstilo)
    form.set("cierreTitulo", cierreTitulo)
    form.set("cierreTexto", cierreTexto)

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
        <div className="grid gap-2">
          <Label>Estilo de las noticias</Label>
          <p className="text-muted-foreground text-xs">
            Cómo se ven los carruseles de noticias. La vista previa usa la noticia más reciente de la cuenta, con el logo y la
            configuración guardados.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {estilos.map((e) => (
              <button
                key={e.valor}
                type="button"
                title={e.pista}
                onClick={() => {
                  setResult(null)
                  setPlantilla(e.valor)
                }}
                aria-pressed={plantilla === e.valor}
                className={`flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
                  plantilla === e.valor ? "border-primary ring-primary ring-2" : "border-input hover:bg-accent"
                }`}
              >
                <div className="grid grid-cols-2 gap-1">
                  {(["portada", "interior"] as const).map((lamina) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={lamina}
                      src={`/api/render/estilo?plantilla=${e.valor}&lamina=${lamina}`}
                      alt={`${e.nombre}: ${lamina}`}
                      loading="lazy"
                      className="bg-muted aspect-[4/5] w-full rounded object-cover"
                    />
                  ))}
                </div>
                <span className="text-sm font-medium">{e.nombre}</span>
                <span className="text-muted-foreground text-xs leading-snug">{e.pista}</span>
              </button>
            ))}
          </div>
        </div>

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

        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="fotosLiterales">Fotos literales del tema</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Ilustra el asunto de frente: si la noticia habla de cafe, busca cafetales. Apagado,
              busca la imagen de alrededor —una oficina, unas manos, una pantalla— que ilustra sin
              repetir el titular. Enciendelo cuando el tema tenga una foto obvia y util; en
              tecnologia suele dar tipicos.
            </p>
          </div>
          <Switch
            id="fotosLiterales"
            checked={literales && usarFotos && pexelsConfigurado}
            disabled={!pexelsConfigurado || !usarFotos}
            onCheckedChange={(v) => {
              setResult(null)
              setLiterales(Boolean(v))
            }}
            aria-label="Buscar fotos literales del tema"
          />
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <Label>Lamina de cierre</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Cierra todos los carruseles, con el logo si lo has subido. Es la llamada a seguir
              la cuenta, asi que va siempre: es lo unico que convierte un carrusel en audiencia,
              y dejarlo al criterio de cada generacion era garantizar que faltara.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["marca", "Marca", "El logo sobre una foto, con el titular debajo."],
                ["perfil", "Perfil", "El titular grande y una captura de tu perfil con el cursor sobre seguir."],
              ] as const
            ).map(([valor, nombre, pista]) => (
              <button
                key={valor}
                type="button"
                title={pista}
                onClick={() => {
                  setResult(null)
                  setCierreEstilo(valor)
                }}
                aria-pressed={cierreEstilo === valor}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  cierreEstilo === valor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent border-input"
                }`}
              >
                {nombre}
              </button>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">
            {cierreEstilo === "perfil"
              ? "Enseñar donde hay que pulsar convierte mejor que pedirlo con palabras. Necesita la captura del perfil, que se sube arriba; sin ella el cierre sale en estilo marca."
              : "Sobrio: el logo sobre una foto de fondo, con el titular y la frase debajo."}
          </p>

          <div className="grid gap-3">
            <Input
              maxLength={40}
              placeholder="Síguenos"
              value={cierreTitulo}
              onChange={(e) => {
                setResult(null)
                setCierreTitulo(e.target.value)
              }}
            />
            <Input
              maxLength={140}
              placeholder="para no perderte ningún hecho importante del agro colombiano"
              value={cierreTexto}
              onChange={(e) => {
                setResult(null)
                setCierreTexto(e.target.value)
              }}
            />
          </div>
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
