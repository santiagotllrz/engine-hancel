"use client"

import * as React from "react"

import { computeLayout, type PositionedNode } from "@/components/engine/force-layout"
import { Button } from "@/components/ui/button"
import type { GraphData } from "@/lib/engine-data"
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react"

type View = { x: number; y: number; k: number }

const KIND_LABEL: Record<PositionedNode["kind"], string> = {
  category: "Categoria",
  segment: "Segmento",
  news: "Noticia",
}

export function BrainGraph({ data }: { data: GraphData }) {
  const layout = React.useMemo(() => computeLayout(data), [data])

  const [view, setView] = React.useState<View>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  /** Vecinos directos de cada nodo, para atenuar todo lo demas al pasar el raton. */
  const neighbors = React.useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (a: string, b: string) => {
      const set = map.get(a)
      if (set) set.add(b)
      else map.set(a, new Set([b]))
    }
    for (const link of layout.links) {
      add(link.source.id, link.target.id)
      add(link.target.id, link.source.id)
    }
    return map
  }, [layout])

  const focus = hovered ?? selected
  const focusSet = React.useMemo(() => {
    if (!focus) return null
    const set = new Set<string>([focus])
    for (const id of neighbors.get(focus) ?? []) set.add(id)
    return set
  }, [focus, neighbors])

  const selectedNode = React.useMemo(
    () => layout.nodes.find((node) => node.id === selected) ?? null,
    [layout, selected]
  )

  const { minX, minY, maxX, maxY } = layout.bounds
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const padding = 40
  const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`

  const reset = () => setView({ x: 0, y: 0, k: 1 })
  const zoomBy = (factor: number) =>
    setView((current) => ({ ...current, k: clamp(current.k * factor, 0.4, 6) }))

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start) return
    setView((current) => ({
      ...current,
      x: start.vx + (event.clientX - start.x),
      y: start.vy + (event.clientY - start.y),
    }))
  }

  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div className="bg-card relative overflow-hidden rounded-xl border">
      {/* Retícula de puntos: da profundidad y hace legible el paneo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--foreground) 14%, transparent) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="relative block h-[clamp(420px,68vh,760px)] w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label={`Grafo del motor: ${data.counts.categories} categorias, ${data.counts.segments} segmentos, ${data.counts.news} noticias`}
      >
        <g
          transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
          style={{ transformOrigin: "center" }}
        >
          <g fill="none" className="text-muted-foreground">
            {layout.links.map((link, index) => {
              const lit =
                !focusSet || (focusSet.has(link.source.id) && focusSet.has(link.target.id))
              return (
                <path
                  key={index}
                  d={arc(link.source, link.target)}
                  strokeWidth={link.target.kind === "news" ? 0.5 : 1.1}
                  strokeOpacity={lit ? (link.target.kind === "news" ? 0.24 : 0.55) : 0.04}
                  stroke={lit ? link.source.color : "currentColor"}
                />
              )
            })}
          </g>

          {layout.nodes.map((node) => {
            const lit = !focusSet || focusSet.has(node.id)
            const isSelected = node.id === selected
            return (
              <g key={node.id}>
                {node.kind !== "news" && lit ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r * 2.4}
                    fill={node.color}
                    opacity={0.13}
                  />
                ) : null}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={node.color}
                  fillOpacity={lit ? (node.kind === "news" ? 0.85 : 1) : 0.12}
                  stroke={isSelected ? "currentColor" : node.color}
                  strokeWidth={isSelected ? 2 : 0}
                  className="cursor-pointer transition-[fill-opacity]"
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(node.id === selected ? null : node.id)}
                />
                {node.kind !== "news" ? (
                  <text
                    x={node.x}
                    y={node.y - node.r - 7}
                    textAnchor="middle"
                    className="text-foreground pointer-events-none select-none"
                    fontSize={node.kind === "category" ? 13 : 9}
                    fontWeight={node.kind === "category" ? 600 : 500}
                    fill="currentColor"
                    fillOpacity={lit ? 0.95 : 0.25}
                  >
                    {node.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="bg-background/85 text-muted-foreground pointer-events-auto flex flex-wrap gap-3 rounded-lg border px-3 py-2 text-xs backdrop-blur">
          {[
            { label: `${data.counts.categories} categorias`, size: 9 },
            { label: `${data.counts.segments} segmentos`, size: 6 },
            { label: `${data.counts.news} noticias`, size: 3.5 },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden>
                <circle r={item.size} fill="currentColor" fillOpacity={0.6} />
              </svg>
              {item.label}
            </span>
          ))}
        </div>

        <div className="pointer-events-auto flex gap-1">
          <GraphButton onClick={() => zoomBy(1.2)} label="Acercar">
            <PlusIcon className="size-4" />
          </GraphButton>
          <GraphButton onClick={() => zoomBy(1 / 1.2)} label="Alejar">
            <MinusIcon className="size-4" />
          </GraphButton>
          <GraphButton onClick={reset} label="Reencuadrar">
            <MaximizeIcon className="size-4" />
          </GraphButton>
        </div>
      </div>

      {selectedNode ? (
        <div className="bg-background/95 absolute right-3 bottom-3 left-3 max-w-md rounded-lg border p-3 shadow-lg backdrop-blur sm:left-auto">
          <p className="text-muted-foreground text-[10px] tracking-widest uppercase">
            {KIND_LABEL[selectedNode.kind]}
          </p>
          <p className="mt-1 text-sm leading-snug font-medium">{selectedNode.label}</p>
          {selectedNode.meta ? (
            <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(selectedNode.meta).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-muted-foreground/70 capitalize">{key}</dt>
                  <dd className="truncate">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground/70 absolute bottom-3 left-3 text-xs">
          Arrastra para mover · rueda para acercar · clic en un nodo para inspeccionarlo
        </p>
      )}
    </div>
  )
}

function GraphButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      onClick={onClick}
      className="bg-background/85 size-8 border backdrop-blur"
    >
      {children}
    </Button>
  )
}


/**
 * Arista como arco y no como recta.
 *
 * Con cientos de aristas rectas superpuestas no se distingue cual conecta con
 * cual; curvarlas todas hacia el mismo lado las separa visualmente y da a la
 * red la forma organica de las referencias.
 */
function arc(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy) || 1
  const bow = Math.min(distance * 0.18, 46)
  // Punto de control desplazado en perpendicular al segmento.
  const cx = (a.x + b.x) / 2 - (dy / distance) * bow
  const cy = (a.y + b.y) / 2 + (dx / distance) * bow
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
