import { CarouselStyleEditor } from "@/components/contenido/carousel-style-editor"
import { GenerationConfigEditor } from "@/components/contenido/generation-config-editor"
import { LinkedinConnection } from "@/components/contenido/linkedin-connection"
import { PublishScheduleEditor } from "@/components/contenido/publish-schedule-editor"
import { DashboardShell } from "@/components/dashboard-shell"
import { pexelsConfigurado } from "@/engine/render/pexels"
import { estiloDesdeConfig } from "@/engine/render/theme"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
import { getPublishSchedules, proximasTandas } from "@/engine/publish/schedule"
import { pendingToPublish } from "@/engine/publish/publish-piece"
import { getSettings, hourIn } from "@/engine/schedule"
import { getGenerationConfig, getScoreDistribution } from "@/lib/content-data"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Variables · Engine Hancel",
}

export default async function ContenidoConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const [config, distribution, linkedin, schedules, ajustes] = await Promise.all([
    getGenerationConfig(),
    getScoreDistribution(),
    getLinkedinStatus(),
    getPublishSchedules(),
    getSettings(),
  ])

  const ahora = new Date()
  const proximas: Record<string, string[]> = {}
  const disponibles: Record<string, number> = {}
  for (const schedule of schedules) {
    proximas[schedule.network] = proximasTandas(schedule, ajustes.timezone, ahora)
    disponibles[schedule.network] = (await pendingToPublish(schedule.network, 50)).length
  }

  return (
    <DashboardShell title="Variables">
      <div className="flex max-w-3xl flex-col gap-4">
        <LinkedinConnection
          status={linkedin}
          resultado={first("linkedin")}
          motivo={first("motivo") ?? first("cuenta")}
        />
      </div>

      <GenerationConfigEditor config={config} distribution={distribution} />

      <div className="flex max-w-3xl flex-col gap-4">
        <PublishScheduleEditor
          schedules={schedules}
          timezone={ajustes.timezone}
          horaActual={hourIn(ajustes.timezone, ahora)}
          proximas={proximas}
          disponibles={disponibles}
          linkedinConectado={linkedin.connected && !linkedin.expired}
        />

        <CarouselStyleEditor
          estilo={estiloDesdeConfig(config.carousel)}
          paletaActual={
            ((config.carousel ?? {}) as { paleta?: string }).paleta ?? "noche"
          }
          pexelsConfigurado={pexelsConfigurado()}
        />
      </div>
    </DashboardShell>
  )
}
