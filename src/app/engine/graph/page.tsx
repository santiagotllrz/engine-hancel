import { DashboardShell } from "@/components/dashboard-shell"
import { BrainGraph } from "@/components/engine/brain-graph"
import { getGraphData } from "@/lib/engine-data"

export const dynamic = "force-dynamic"

export const metadata = { title: "Grafo · Hancel Engine" }

export default async function EngineGraphPage() {
  const data = await getGraphData()

  return (
    <DashboardShell title="Grafo">
      <p className="text-muted-foreground text-sm">
        Cada categoria sostiene sus segmentos, y cada segmento las noticias que ha traido. El
        tamaño del nodo distingue el nivel; el color, la categoria.
      </p>
      <BrainGraph data={data} />
    </DashboardShell>
  )
}
