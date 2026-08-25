import { DashboardShell } from "@/components/dashboard-shell"
import { TaxonomyEditor } from "@/components/engine/taxonomy-editor"
import { getTaxonomy } from "@/lib/engine-data"

export const dynamic = "force-dynamic"

export const metadata = { title: "Taxonomia · Hancel Engine" }

export default async function EngineConfigPage() {
  const taxonomy = await getTaxonomy()

  return (
    <DashboardShell title="Taxonomia">
      <div className="max-w-4xl">
        <p className="text-muted-foreground mb-4 text-sm">
          Categoria → segmento → keyword. La categoria se guarda en{" "}
          <code>raw_news.niche</code>, el segmento en <code>tema</code>, y la keyword es la
          consulta literal que recibe Serper.
        </p>
        <TaxonomyEditor taxonomy={taxonomy} />
      </div>
    </DashboardShell>
  )
}
