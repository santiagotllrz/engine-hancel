import { GenerationConfigEditor } from "@/components/contenido/generation-config-editor"
import { DashboardShell } from "@/components/dashboard-shell"
import { getGenerationConfig, getScoreDistribution } from "@/lib/content-data"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Variables · Engine Hancel",
}

export default async function ContenidoConfigPage() {
  const [config, distribution] = await Promise.all([
    getGenerationConfig(),
    getScoreDistribution(),
  ])

  return (
    <DashboardShell title="Variables">
      <GenerationConfigEditor config={config} distribution={distribution} />
    </DashboardShell>
  )
}
