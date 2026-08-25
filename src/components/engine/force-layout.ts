import type { GraphData, GraphNode } from "@/lib/engine-data"

export type PositionedNode = GraphNode & { x: number; y: number; r: number }

export type LayoutResult = {
  nodes: PositionedNode[]
  links: { source: PositionedNode; target: PositionedNode }[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const RADIUS: Record<GraphNode["kind"], number> = {
  category: 15,
  segment: 8,
  news: 3.6,
}

/** Largo de reposo del muelle segun el tipo de arista. */
function springLength(a: GraphNode, b: GraphNode): number {
  if (a.kind === "category" || b.kind === "category") return 190
  return 62
}

/**
 * Layout dirigido por fuerzas, resuelto de una vez antes de pintar.
 *
 * Se calcula sincrono en vez de animar la simulacion cuadro a cuadro: para los
 * pocos cientos de nodos del grafo termina en milisegundos, y un grafo que
 * aparece quieto se lee mucho mejor que uno que se reacomoda solo mientras
 * intentas hacer clic.
 *
 * Determinista a proposito (siembra fija en vez de Math.random): el mismo
 * conjunto de datos dibuja siempre el mismo mapa, asi que la posicion de las
 * cosas se vuelve memorizable entre visitas.
 */
export function computeLayout(data: GraphData, iterations = 320): LayoutResult {
  const nodes: PositionedNode[] = data.nodes.map((node, index) => {
    // Siembra en espiral aurea: reparte sin agrupamientos artificiales.
    const angle = index * 2.399963229728653
    const radius = 26 * Math.sqrt(index + 1)
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      r: RADIUS[node.kind],
    }
  })

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const links = data.links
    .map((link) => ({ source: byId.get(link.source), target: byId.get(link.target) }))
    .filter(
      (link): link is { source: PositionedNode; target: PositionedNode } =>
        Boolean(link.source && link.target)
    )

  const velocity = nodes.map(() => ({ x: 0, y: 0 }))
  // Las categorias pesan mas y por tanto se mueven menos: quedan de ancla.
  const mass = nodes.map((node) =>
    node.kind === "category" ? 6 : node.kind === "segment" ? 2.4 : 1
  )

  for (let step = 0; step < iterations; step++) {
    const alpha = 1 - step / iterations
    const force = nodes.map(() => ({ x: 0, y: 0 }))

    // Repulsion de todos contra todos.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x
        let dy = nodes[j].y - nodes[i].y
        let distanceSq = dx * dx + dy * dy

        if (distanceSq < 0.01) {
          // Dos nodos exactamente encima: se separan con un empujon fijo
          // derivado del indice, para no depender de aleatoriedad.
          dx = ((i % 7) - 3) * 0.1 || 0.1
          dy = ((j % 5) - 2) * 0.1 || 0.1
          distanceSq = dx * dx + dy * dy
        }

        const distance = Math.sqrt(distanceSq)
        const push = (1400 * alpha) / distanceSq
        const ux = (dx / distance) * push
        const uy = (dy / distance) * push

        force[i].x -= ux
        force[i].y -= uy
        force[j].x += ux
        force[j].y += uy
      }
    }

    // Muelles a lo largo de las aristas.
    for (const link of links) {
      const i = nodes.indexOf(link.source)
      const j = nodes.indexOf(link.target)
      const dx = link.target.x - link.source.x
      const dy = link.target.y - link.source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.01
      const rest = springLength(link.source, link.target)
      const pull = (distance - rest) * 0.045 * alpha
      const ux = (dx / distance) * pull
      const uy = (dy / distance) * pull

      force[i].x += ux
      force[i].y += uy
      force[j].x -= ux
      force[j].y -= uy
    }

    // Gravedad suave al centro, para que nada se escape del lienzo.
    for (let i = 0; i < nodes.length; i++) {
      force[i].x -= nodes[i].x * 0.012 * alpha
      force[i].y -= nodes[i].y * 0.012 * alpha
    }

    for (let i = 0; i < nodes.length; i++) {
      velocity[i].x = (velocity[i].x + force[i].x / mass[i]) * 0.82
      velocity[i].y = (velocity[i].y + force[i].y / mass[i]) * 0.82
      nodes[i].x += velocity[i].x
      nodes[i].y += velocity[i].y
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.r)
    minY = Math.min(minY, node.y - node.r)
    maxX = Math.max(maxX, node.x + node.r)
    maxY = Math.max(maxY, node.y + node.r)
  }

  if (!Number.isFinite(minX)) {
    minX = -100
    minY = -100
    maxX = 100
    maxY = 100
  }

  return { nodes, links, bounds: { minX, minY, maxX, maxY } }
}
