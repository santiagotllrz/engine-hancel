import { QueuePanel } from "@/components/contenido/queue-panel"
import { RoutinesWarning } from "@/components/contenido/routines-warning"
import { DashboardShell } from "@/components/dashboard-shell"
import { getQueue, getRoutinesStatus } from "@/lib/content-data"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Cola · Engine Hancel",
}

export default async function ContenidoColaPage() {
  const queue = await getQueue()

  return (
    <DashboardShell title="Cola">
      <RoutinesWarning status={getRoutinesStatus()} />

      <QueuePanel angle={queue.angle} linkedin={queue.linkedin} instagram={queue.instagram} />
    </DashboardShell>
  )
}
