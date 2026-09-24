"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { FichaDialog } from "@/components/kanban/ficha-dialog"
import type { Etapa, Ficha, Tablero as TableroDatos } from "@/lib/kanban-data"

/**
 * El tablero del pipeline.
 *
 * Cuatro fases y, dentro, las etapas por las que pasa el hecho. Se agrupa asi
 * porque "noticia traida" y "noticia analizada" son momentos distintos del
 * mismo trabajo, y verlos como dos columnas sueltas perdia esa relacion.
 *
 * Una tarjeta por hecho, no por pieza: un hecho produce un angulo y de ahi
 * varios posts, y todo eso es la misma historia. La tarjeta se mueve sola.
 */

const GRUPOS: { titulo: string; etapas: { id: Etapa; titulo: string; pista: string }[] }[] = [
  {
    titulo: "Noticias",
    etapas: [
      { id: "sin_analizar", titulo: "Traidas", pista: "Recien llegadas, en cola" },
      { id: "analizada", titulo: "Analizadas", pista: "Con score y notas" },
    ],
  },
  {
    titulo: "Contenido",
    etapas: [
      { id: "angulo", titulo: "Angulo", pista: "Enfoque decidido" },
      { id: "post", titulo: "Post", pista: "Piezas generadas" },
    ],
  },
  {
    titulo: "Publicado",
    etapas: [{ id: "publicado", titulo: "Publicado", pista: "Ya salio a las redes" }],
  },
  {
    titulo: "Descartados",
    etapas: [
      { id: "descartado", titulo: "A mano", pista: "Rechazados por ti" },
      { id: "descartado_fecha", titulo: "Por fecha", pista: "Ya eran viejas al llegar" },
    ],
  },
]

const NOMBRE_RED: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
}

export function Tablero({ datos }: { datos: TableroDatos }) {
  const [ficha, setFicha] = React.useState<Ficha | null>(null)
  const [abierta, setAbierta] = React.useState(false)

  function abrir(f: Ficha) {
    setFicha(f)
    setAbierta(true)
  }

  return (
    <>
      {/* Scroll horizontal: seis columnas no caben en un portatil, y partirlas
          en dos filas rompe la lectura de izquierda a derecha del proceso. */}
      <div className="flex items-start gap-5 overflow-x-auto pb-2">
        {GRUPOS.map((grupo) => {
          const total = grupo.etapas.reduce((n, e) => n + datos.conteos[e.id], 0)
          return (
            <section key={grupo.titulo} className="shrink-0">
              <header className="mb-2 flex items-baseline gap-2 border-b pb-1">
                <h2 className="text-sm font-semibold">{grupo.titulo}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
              </header>

              <div className="flex gap-3">
                {grupo.etapas.map((etapa) => (
                  <Columna
                    key={etapa.id}
                    titulo={etapa.titulo}
                    pista={etapa.pista}
                    fichas={datos.fichas[etapa.id]}
                    total={datos.conteos[etapa.id]}
                    onAbrir={abrir}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <FichaDialog ficha={ficha} abierta={abierta} onOpenChange={setAbierta} />
    </>
  )
}

function Columna({
  titulo,
  pista,
  fichas,
  total,
  onAbrir,
}: {
  titulo: string
  pista: string
  fichas: Ficha[]
  /** Cuantas hay de verdad: puede ser mas de las que se pintan. */
  total: number
  onAbrir: (f: Ficha) => void
}) {
  const ocultas = total - fichas.length
  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className="px-1">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-medium">{titulo}</h3>
          <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
        </div>
        <p className="text-muted-foreground text-[11px]">{pista}</p>
      </div>

      <div className="flex flex-col gap-2">
        {fichas.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
            Nada por aqui
          </p>
        ) : (
          fichas.map((f) => <Tarjeta key={f.newsId} ficha={f} onAbrir={() => onAbrir(f)} />)
        )}

        {ocultas > 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-center text-xs">
            y {ocultas} mas
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Tarjeta({ ficha, onAbrir }: { ficha: Ficha; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="hover:bg-accent/50 flex flex-col gap-2 overflow-hidden rounded-lg border bg-card text-left transition-colors"
    >
      {/* La imagen ya generada: en cuanto hay pieza, la tarjeta la enseña, que es
          lo que de verdad se quiere revisar de un vistazo. */}
      {ficha.miniatura ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ficha.miniatura}
          alt=""
          className="h-28 w-full object-cover"
          loading="lazy"
        />
      ) : null}

      <div className="flex flex-col gap-2 p-3 pt-0 first:pt-3">
        <p className="line-clamp-3 text-sm leading-snug font-medium">{ficha.titulo}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal">
            {ficha.tema}
          </Badge>

          {/* El score acompaña al hecho desde que se analiza: en contenido dice
              con que nota entro, que es lo que justifica que se generara. */}
          {ficha.analizada && ficha.score !== null ? (
            <Badge variant={ficha.score >= 8 ? "default" : "secondary"}>{ficha.score}/10</Badge>
          ) : null}

          {ficha.etapa === "sin_analizar" ? <Badge variant="secondary">En cola</Badge> : null}

          {ficha.piezas.map((p) => (
            <Badge key={p.id} variant={p.status === "published" ? "default" : "secondary"}>
              {NOMBRE_RED[p.network] ?? p.network}
            </Badge>
          ))}
        </div>

        {ficha.fuente ? (
          <p className="text-muted-foreground truncate text-xs">{ficha.fuente}</p>
        ) : null}
      </div>
    </button>
  )
}
