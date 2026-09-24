import { CarouselStyleEditor } from "@/components/contenido/carousel-style-editor"
import { ClaudeConnection } from "@/components/contenido/claude-connection"
import { ClaudeModels } from "@/components/contenido/claude-models"
import { GenerationConfigEditor } from "@/components/contenido/generation-config-editor"
import { BufferChannel } from "@/components/contenido/buffer-channel"
import { LinkedinConnection } from "@/components/contenido/linkedin-connection"
import { PublishScheduleEditor } from "@/components/contenido/publish-schedule-editor"
import { DashboardShell } from "@/components/dashboard-shell"
import { pexelsConfigurado } from "@/engine/render/pexels"
import { estiloDesdeConfig } from "@/engine/render/theme"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
import { getPublishSchedules, proximasTandas } from "@/engine/publish/schedule"
import { pendingToPublish } from "@/engine/publish/publish-piece"
import { getSettings, hourIn } from "@/engine/schedule"
import { estadoTokenClaude } from "@/app/cuenta/actions"
import { modelosClaude } from "@/engine/claude/modelos"
import { cuentaActual } from "@/lib/accounts"
import { configuracionDeGeneracion, getScoreDistribution } from "@/lib/content-data"

export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina corren en su misma ruta, asi que heredan
 * este tope. Sin declararlo se quedan en el de por defecto de la plataforma
 * —unos segundos— y las acciones largas (redibujar un carrusel, analizar una
 * noticia, publicar) se cortan a media faena sin decir nada.
 */
export const maxDuration = 60


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

  const cuenta = await cuentaActual()
  const [config, distribution, linkedin, schedules, ajustes, tokenClaude, modelos] =
    await Promise.all([
      configuracionDeGeneracion(),
      getScoreDistribution(),
      getLinkedinStatus(cuenta.id),
      getPublishSchedules(cuenta.id),
      getSettings(cuenta.id),
      estadoTokenClaude(),
      modelosClaude(),
    ])

  const ahora = new Date()
  const proximas: Record<string, string[]> = {}
  const disponibles: Record<string, number> = {}
  for (const schedule of schedules) {
    proximas[schedule.network] = proximasTandas(schedule, ajustes.timezone, ahora)
    disponibles[schedule.network] = (await pendingToPublish(cuenta.id, schedule.network, 50)).length
  }

  return (
    <DashboardShell title="Variables">
      <div className="flex max-w-3xl flex-col gap-4">
        <ClaudeConnection estado={tokenClaude} />
        <ClaudeModels modelos={modelos} />
        <LinkedinConnection
          status={linkedin}
          resultado={first("linkedin")}
          motivo={first("motivo") ?? first("cuenta")}
        />
        <BufferChannel
          red="instagram"
          canal={cuenta.buffer_instagram_channel_id}
          nombreCuenta={cuenta.name}
        />
        <BufferChannel
          red="facebook"
          canal={cuenta.buffer_facebook_channel_id}
          nombreCuenta={cuenta.name}
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
          canales={{
            instagram: Boolean(cuenta.buffer_instagram_channel_id),
            facebook: Boolean(cuenta.buffer_facebook_channel_id),
          }}
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
