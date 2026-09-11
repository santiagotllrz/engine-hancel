import { ContentStudio } from "@/components/contenido/content-studio"
import { RoutinesWarning } from "@/components/contenido/routines-warning"
import { idDeCuentaActual } from "@/lib/accounts"
import { DashboardShell } from "@/components/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getAngles,
  getCandidates,
  getContentCounts,
  configuracionDeGeneracion,
  getPieces,
  getRoutinesStatus,
} from "@/lib/content-data"
import { bufferConfigurado } from "@/engine/publish/buffer"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
import { formatNumber } from "@/lib/format"

// Cambia con cada pasada del pipeline: nada que prerenderizar.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Contenido · Engine Hancel",
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

export default async function ContenidoPage() {
  const accountId = await idDeCuentaActual()
  const [config, candidates, angles, pieces, counts, linkedin] = await Promise.all([
    configuracionDeGeneracion(),
    getCandidates(),
    getAngles(),
    getPieces(),
    getContentCounts(),
    getLinkedinStatus(accountId),
  ])


  return (
    <DashboardShell title="Contenido">
      <RoutinesWarning status={getRoutinesStatus()} />

      <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Candidatas" value={formatNumber(counts.candidatas)} />
        <StatCard label="Angulos" value={formatNumber(counts.angulos)} />
        <StatCard label="Por revisar" value={formatNumber(counts.porRevisar)} />
        <StatCard label="Aprobadas" value={formatNumber(counts.aprobadas)} />
      </div>

      <ContentStudio
        candidates={candidates}
        angles={angles}
        pieces={pieces}
        hasThreshold={config.score_threshold !== null}
        linkedinConnected={linkedin.connected && !linkedin.expired}
        // Con la clave basta: el canal se resuelve al publicar, porque la cuenta
        // ya esta conectada en Buffer y no hay que volver a elegirla aqui.
        instagramListo={bufferConfigurado()}
      />
    </DashboardShell>
  )
}
