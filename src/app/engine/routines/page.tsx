import { DashboardShell } from "@/components/dashboard-shell"
import { RoutinesEditor } from "@/components/engine/routines-editor"
import { getRoutines } from "@/lib/engine-data"

export const dynamic = "force-dynamic"

export const metadata = { title: "Rutinas · Hancel Engine" }

export default async function EngineRoutinesPage() {
  const routines = await getRoutines()

  return (
    <DashboardShell title="Rutinas">
      <div className="max-w-4xl">
        <RoutinesEditor routines={routines} />
      </div>
    </DashboardShell>
  )
}
