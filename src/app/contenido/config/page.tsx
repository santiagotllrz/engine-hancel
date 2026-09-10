import { CarouselStyleEditor } from "@/components/contenido/carousel-style-editor"
import { GenerationConfigEditor } from "@/components/contenido/generation-config-editor"
import { LinkedinConnection } from "@/components/contenido/linkedin-connection"
import { DashboardShell } from "@/components/dashboard-shell"
import { pexelsConfigurado } from "@/engine/render/pexels"
import { estiloDesdeConfig } from "@/engine/render/theme"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
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

  const [config, distribution, linkedin] = await Promise.all([
    getGenerationConfig(),
    getScoreDistribution(),
    getLinkedinStatus(),
  ])

  return (
    <DashboardShell title="Variables">
      <div className="flex max-w-3xl flex-col gap-4">
        <LinkedinConnection
          status={linkedin}
          resultado={first("linkedin")}
          motivo={first("motivo") ?? first("cuenta")}
        />
      </div>

      <GenerationConfigEditor
        config={config}
        distribution={distribution}
        linkedinConnected={linkedin.connected && !linkedin.expired}
      />

      <div className="flex max-w-3xl flex-col gap-4">
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
