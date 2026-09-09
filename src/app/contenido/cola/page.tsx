import { QueuePanel } from "@/components/contenido/queue-panel"
import { DashboardShell } from "@/components/dashboard-shell"
import { getQueue } from "@/lib/content-data"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Cola · Engine Hancel",
}

export default async function ContenidoColaPage() {
  const queue = await getQueue()

  return (
    <DashboardShell title="Cola">
      <QueuePanel angle={queue.angle} linkedin={queue.linkedin} />
    </DashboardShell>
  )
}
