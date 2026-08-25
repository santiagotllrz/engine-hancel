"use client"

import * as React from "react"

export type SegmentState = "idle" | "running" | "done" | "failed"

export type NetworkSegment = {
  key: string
  label: string
  niche: string
  color: string
  state: SegmentState
  /** Noticias traidas por la corrida en curso. */
  found: number
  /** Noticias que este segmento ya tenia guardadas. */
  stored: number
}

const SIZE = 640
const C = SIZE / 2
const CORE_R = 176
const FRINGE_R = 252
/** Tope por segmento: por encima, la maraña deja de leerse y solo cuesta pintar. */
const MAX_PER_SEGMENT = 46

/** Color dominante de la masa, como la red de coautoria de la referencia. */
const MASS = "#e11d63"

/**
 * Ruido determinista.
 *
 * No se usa Math.random a proposito: la red debe dibujarse igual en cada
 * render y en cada visita, o cambiaria de forma sola al llegar cada resultado.
 */
function noise(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return value - Math.floor(value)
}

type Node = {
  id: string
  x: number
  y: number
  r: number
  color: string
  fringe: boolean
  /** Indice de entrada, para escalonar la animacion al aparecer. */
  order: number
  fresh: boolean
}

type Edge = {
  id: string
  d: string
  color: string
  width: number
  opacity: number
  fresh: boolean
  order: number
  length: number
}

function polar(radius: number, angle: number): [number, number] {
  return [C + Math.cos(angle) * radius, C + Math.sin(angle) * radius]
}

/** Arco entre dos puntos, curvado siempre hacia el mismo lado. */
function arc(ax: number, ay: number, bx: number, by: number, bow: number): string {
  const dx = bx - ax
  const dy = by - ay
  const distance = Math.hypot(dx, dy) || 1
  const cx = (ax + bx) / 2 - (dy / distance) * distance * bow
  const cy = (ay + by) / 2 + (dx / distance) * distance * bow
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`
}

/**
 * Construye la maraña.
 *
 * Los sectores de cada segmento se solapan a proposito (`SPREAD` supera el
 * ancho de sector): asi las categorias se funden en una sola masa en vez de
 * verse como porciones de tarta, que es lo que da la textura de red de la
 * referencia. La estructura local sigue ahi para quien la busque.
 */
function build(segments: NetworkSegment[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  if (segments.length === 0) return { nodes, edges }

  const sector = (Math.PI * 2) / segments.length
  const SPREAD = sector * 1.9
  const hubs: { x: number; y: number; color: string }[] = []

  segments.forEach((segment, i) => {
    const base = i * sector - Math.PI / 2
    const [hx, hy] = polar(46 + noise(i, 91) * 74, base + (noise(i, 7) - 0.5) * sector)
    hubs.push({ x: hx, y: hy, color: segment.color })
  })

  segments.forEach((segment, i) => {
    const hub = hubs[i]
    const total = Math.min(segment.stored + segment.found, MAX_PER_SEGMENT)
    // Los ultimos `found` nodos son los de esta corrida: entran animados.
    const freshFrom = Math.max(total - segment.found, 0)

    for (let k = 0; k < total; k++) {
      const n1 = noise(i * 13 + 1, k * 3 + 5)
      const n2 = noise(i * 29 + 7, k * 11 + 2)
      const n3 = noise(i * 53 + 3, k * 17 + 9)

      const fringe = n3 > 0.84
      // sqrt reparte por area y no por radio: sin eso el centro se satura.
      const radius = fringe
        ? CORE_R + 18 + n2 * (FRINGE_R - CORE_R - 18)
        : 26 + Math.sqrt(n2) * (CORE_R - 26)
      const angle = i * sector - Math.PI / 2 + (n1 - 0.5) * SPREAD

      const [x, y] = polar(radius, angle)
      const fresh = k >= freshFrom && segment.found > 0
      const order = k

      nodes.push({
        id: `${segment.key}:${k}`,
        x,
        y,
        r: fringe ? 1.9 : 1.6 + n3 * 3.4,
        color: fringe ? segment.color : MASS,
        fringe,
        order,
        fresh,
      })

      // Arista al concentrador del segmento.
      const d = arc(x, y, hub.x, hub.y, (n1 - 0.5) * 0.42)
      edges.push({
        id: `h-${segment.key}-${k}`,
        d,
        color: fringe ? segment.color : MASS,
        width: fringe ? 0.5 : 0.42,
        opacity: fringe ? 0.5 : 0.34,
        fresh,
        order,
        length: Math.hypot(x - hub.x, y - hub.y) * 1.5,
      })

      // Malla local: encadena cada nodo con el anterior del mismo segmento.
      if (k > 0) {
        const prev = nodes[nodes.length - 2]
        if (prev) {
          edges.push({
            id: `m-${segment.key}-${k}`,
            d: arc(prev.x, prev.y, x, y, (n2 - 0.5) * 0.55),
            color: MASS,
            width: 0.35,
            opacity: 0.22,
            fresh,
            order,
            length: Math.hypot(x - prev.x, y - prev.y) * 1.5,
          })
        }
      }

      // Cada pocos nodos, un arco largo que cruza la masa hacia otro segmento.
      if (k % 4 === 2 && segments.length > 2) {
        const other = hubs[(i + 3 + Math.floor(n3 * 2)) % segments.length]
        edges.push({
          id: `x-${segment.key}-${k}`,
          d: arc(x, y, other.x, other.y, (n3 - 0.5) * 0.5),
          color: MASS,
          width: 0.3,
          opacity: 0.14,
          fresh,
          order,
          length: Math.hypot(x - other.x, y - other.y) * 1.5,
        })
      }

      // Racimo de la periferia: los puntos de color del borde en la referencia.
      if (fringe) {
        const satellites = 2 + Math.floor(n1 * 3)
        for (let sIndex = 0; sIndex < satellites; sIndex++) {
          const sa = angle + (noise(k, sIndex * 31) - 0.5) * 0.24
          const sr = radius + 8 + noise(k * 7, sIndex) * 22
          const [sx, sy] = polar(sr, sa)
          nodes.push({
            id: `${segment.key}:${k}:s${sIndex}`,
            x: sx,
            y: sy,
            r: 1.5,
            color: segment.color,
            fringe: true,
            order,
            fresh,
          })
          edges.push({
            id: `s-${segment.key}-${k}-${sIndex}`,
            d: arc(x, y, sx, sy, 0.5),
            color: segment.color,
            width: 0.45,
            opacity: 0.55,
            fresh,
            order,
            length: Math.hypot(sx - x, sy - y) * 1.6,
          })
        }
      }
    }
  })

  return { nodes, edges }
}

/**
 * La red del motor.
 *
 * En reposo dibuja el corpus que ya existe en la base. Durante una corrida,
 * cada busqueda que responde hace brotar en su sector tantos nodos como
 * noticias trajo de verdad, con sus aristas dibujandose hacia el centro. Los
 * concentradores de las busquedas en vuelo laten; los de las que fallaron se
 * marcan en rojo. Con el motor parado no entra ni un nodo.
 */
export function EngineNetwork({
  segments,
  running,
  total,
}: {
  segments: NetworkSegment[]
  running: boolean
  total: number
}) {
  const { nodes, edges } = React.useMemo(() => build(segments), [segments])

  const sector = (Math.PI * 2) / Math.max(segments.length, 1)
  const hubs = segments.map((segment, i) => {
    const base = i * sector - Math.PI / 2
    const [x, y] = polar(46 + noise(i, 91) * 74, base + (noise(i, 7) - 0.5) * sector)
    return { segment, x, y }
  })

  return (
    <div className="relative flex w-full items-center justify-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[560px]"
        role="img"
        aria-label={
          running
            ? "Motor en ejecucion: la red crece con cada resultado"
            : `Red del motor en reposo, ${total} noticias`
        }
      >
        {/* La red gira despacio en reposo y acelera mientras hay busquedas en
            vuelo: el giro es el indicador de que el motor esta trabajando, y
            vuelve a su deriva de fondo en cuanto termina. */}
        <g
          className="engine-drift"
          style={{ animationDuration: running ? "9s" : "300s" }}
        >
          <g fill="none" strokeLinecap="round">
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                stroke={edge.color}
                strokeWidth={edge.width}
                strokeOpacity={edge.opacity}
                className={edge.fresh ? "engine-edge-in" : undefined}
                style={
                  edge.fresh
                    ? ({
                        animationDelay: `${edge.order * 22}ms`,
                        ["--edge-length" as string]: edge.length.toFixed(0),
                      } as React.CSSProperties)
                    : undefined
                }
              />
            ))}
          </g>

          {nodes.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={node.color}
              fillOpacity={node.fringe ? 0.95 : 0.8}
              className={node.fresh ? "engine-node-in" : undefined}
              style={
                node.fresh ? { animationDelay: `${node.order * 22}ms` } : undefined
              }
            />
          ))}

          {running ? (
            <circle
              cx={C}
              cy={C}
              fill="none"
              stroke={MASS}
              strokeWidth={1}
              strokeOpacity={0.5}
              className="engine-scan"
            />
          ) : null}

          {/* Concentradores: uno por segmento, como los autores influyentes. */}
          {hubs.map(({ segment, x, y }) => {
            const failed = segment.state === "failed"
            const color = failed ? "#f43f5e" : MASS
            const size =
              6 + Math.min(segment.stored + segment.found, MAX_PER_SEGMENT) * 0.24
            return (
              <g key={segment.key}>
                {segment.state === "running" ? (
                  <circle
                    cx={x}
                    cy={y}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={1.2}
                    className="engine-pulse-ring"
                  />
                ) : null}
                {/* Halo del color del lienzo: despega el concentrador de la
                    maraña sin anadir un color mas a la paleta. */}
                <circle
                  cx={x}
                  cy={y}
                  r={size}
                  fill={color}
                  fillOpacity={0.92}
                  stroke="var(--card)"
                  strokeWidth={1.6}
                />
              </g>
            )
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1">
        <span className="text-3xl font-semibold tabular-nums">{total}</span>
        <span className="text-muted-foreground text-[10px] tracking-[0.2em] uppercase">
          {running ? "buscando…" : "noticias en la red"}
        </span>
      </div>
    </div>
  )
}
