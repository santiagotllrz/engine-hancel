"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { FichaDialog } from "@/components/kanban/ficha-dialog"
import type { Columna, Ficha, Tablero as TableroDatos } from "@/lib/kanban-data"

/**
 * El tablero del pipeline.
 *
 * Una columna por etapa y una tarjeta por hecho, no por pieza: un hecho produce
 * un angulo y de ahi varios posts, y todo eso es la misma historia. La tarjeta
 * se mueve de columna sola, segun lo lejos que haya llegado.
 */

const COLUMNAS: { id: Columna; titulo: string; pista: string }[] = [
  { id: "noticias", titulo: "Noticias", pista: "Hechos traidos y analizados" },
  { id: "contenido", titulo: "Contenido", pista: "Con angulo y piezas" },
  { id: "publicado", titulo: "Publicado", pista: "Ya salio a las redes" },
  { id: "descartados", titulo: "Descartados", pista: "Rechazados a mano" },
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
      {/* Scroll horizontal: cuatro columnas no caben en un portatil, y partirlas
          en dos filas rompe la lectura de izquierda a derecha del proceso. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNAS.map((col) => {
          const fichas = datos[col.id]
          return (
            <section key={col.id} className="flex w-72 shrink-0 flex-col gap-2">
              <header className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{col.titulo}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">{fichas.length}</span>
              </header>
              <p className="text-muted-foreground px-1 text-xs">{col.pista}</p>

              <div className="flex flex-col gap-2">
                {fichas.length === 0 ? (
                  <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
                    Nada por aqui
                  </p>
                ) : (
                  fichas.map((f) => <Tarjeta key={f.newsId} ficha={f} onAbrir={() => abrir(f)} />)
                )}
              </div>
            </section>
          )
        })}
      </div>

      <FichaDialog ficha={ficha} abierta={abierta} onOpenChange={setAbierta} />
    </>
  )
}

function Tarjeta({ ficha, onAbrir }: { ficha: Ficha; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="hover:bg-accent/50 flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors"
    >
      <p className="line-clamp-3 text-sm leading-snug font-medium">{ficha.titulo}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="font-normal">
          {ficha.tema}
        </Badge>

        {/* El estado del hecho dentro de su columna: sin analizar, con nota, o
            las redes que ya produjo. */}
        {ficha.columna === "noticias" ? (
          ficha.analizada ? (
            <Badge variant={ficha.score !== null && ficha.score >= 8 ? "default" : "secondary"}>
              {ficha.score ?? "-"}/10
            </Badge>
          ) : (
            <Badge variant="secondary">Sin analizar</Badge>
          )
        ) : null}

        {ficha.piezas.map((p) => (
          <Badge key={p.id} variant={p.status === "published" ? "default" : "secondary"}>
            {NOMBRE_RED[p.network] ?? p.network}
          </Badge>
        ))}

        {ficha.columna === "contenido" && ficha.piezas.length === 0 ? (
          <Badge variant="secondary">Angulo listo</Badge>
        ) : null}
      </div>

      {ficha.fuente ? (
        <p className="text-muted-foreground truncate text-xs">{ficha.fuente}</p>
      ) : null}
    </button>
  )
}
