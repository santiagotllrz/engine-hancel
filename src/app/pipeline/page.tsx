import { DashboardShell } from "@/components/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatNumber, statusLabel } from "@/lib/format"
import { getPipelineRuns } from "@/lib/news"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Pipeline · Engine Hancel",
}

function runVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive"
  if (status === "completed") return "default"
  return "secondary"
}

export default async function PipelinePage() {
  const runs = await getPipelineRuns()

  return (
    <DashboardShell title="Pipeline">
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead className="text-right">Insertadas</TableHead>
                <TableHead className="text-right">Duplicadas</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground py-12 text-center"
                  >
                    Todavia no hay ejecuciones registradas.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.run_type}</TableCell>
                    <TableCell>
                      <Badge variant={runVariant(run.status)}>
                        {statusLabel(run.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(run.started_at)}</TableCell>
                    <TableCell>{formatDateTime(run.ended_at)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(run.raw_inserted ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(run.duplicates_removed ?? 0)}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {run.error_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
