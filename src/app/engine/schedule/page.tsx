import { idDeCuentaActual } from "@/lib/accounts"
import { DashboardShell } from "@/components/dashboard-shell"
import { ScheduleEditor } from "@/components/engine/schedule-editor"
import { getSettings, hourIn, nextRuns } from "@/engine/schedule"

export const dynamic = "force-dynamic"

export const metadata = { title: "Horario · Hancel Engine" }

export default async function EngineSchedulePage() {
  const settings = await getSettings(await idDeCuentaActual())
  const now = new Date()

  return (
    <DashboardShell title="Horario">
      <ScheduleEditor
        settings={settings}
        nextRuns={nextRuns(settings, now)}
        currentHour={hourIn(settings.timezone, now)}
      />
    </DashboardShell>
  )
}
