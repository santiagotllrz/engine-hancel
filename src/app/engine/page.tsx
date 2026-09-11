import Link from "next/link"

import { idDeCuentaActual } from "@/lib/accounts"
import { DashboardShell } from "@/components/dashboard-shell"
import { LiveConsole, type SpokeSeed } from "@/components/engine/live-console"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime, statusLabel } from "@/lib/format"
import { getRecentEvents, getRoutines, getSegmentCounts, getTaxonomy } from "@/lib/engine-data"
import { getPipelineRuns } from "@/lib/news"
import { ClockIcon, NetworkIcon, SettingsIcon, WebhookIcon } from "lucide-react"

import { getSettings, nextRuns } from "@/engine/schedule"

export const dynamic = "force-dynamic"

export const metadata = { title: "Hancel Engine" }

export default async function EnginePage() {
  const accountId = await idDeCuentaActual()
  const [taxonomy, routines, events, runs, settings] = await Promise.all([
    getTaxonomy(accountId),
    getRoutines(),
    getRecentEvents(40),
    getPipelineRuns(),
    getSettings(accountId),
  ])
  const storedBySegment = await getSegmentCounts()
  const upcoming = nextRuns(settings, new Date(), 2)

  // Un radio por segmento activo: es exactamente lo que el motor va a buscar.
  const seeds: SpokeSeed[] = taxonomy
    .filter((category) => category.is_active)
    .flatMap((category) =>
      category.segments
        .filter((segment) => segment.is_active)
        .map((segment) => {
          // La clave debe coincidir con el `label` del evento que emite el motor.
          const key = `${category.slug} · ${segment.label}`
          return {
            key,
            label: segment.label,
            niche: category.slug,
            color: category.color,
            stored: storedBySegment[key] ?? 0,
          }
        })
    )

  const analysisRoutine = routines.find(
    (routine) => routine.kind === "analysis" && routine.is_active
  )
  const lastRun = runs[0]

  return (
    <DashboardShell title="En vivo">
      <LiveConsole seeds={seeds} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Configuracion activa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold tabular-nums">{seeds.length}</p>
            <p className="text-muted-foreground text-sm">
              segmentos activos en{" "}
              {taxonomy.filter((category) => category.is_active).length} categorias
            </p>
            <div className="flex flex-wrap gap-1.5">
              {taxonomy
                .filter((category) => category.is_active)
                .map((category) => (
                  <Badge key={category.id} variant="outline" className="gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: category.color }}
                      aria-hidden
                    />
                    {category.name}
                  </Badge>
                ))}
            </div>
            <Button variant="outline" size="sm" render={<Link href="/engine/config" />}>
              <SettingsIcon />
              Editar taxonomia
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Analisis automatico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysisRoutine ? (
              <>
                <p className="text-lg font-semibold">{analysisRoutine.name}</p>
                <p className="text-muted-foreground text-sm">
                  Se invoca al terminar cada ingesta. Ultima llamada:{" "}
                  {formatDateTime(analysisRoutine.last_called_at)}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Sin configurar</p>
                <p className="text-muted-foreground text-sm">
                  Las noticias se quedaran en <code>pending_analysis</code> hasta que haya una
                  rutina de analisis activa.
                </p>
              </>
            )}
            <Button variant="outline" size="sm" render={<Link href="/engine/routines" />}>
              <WebhookIcon />
              Gestionar rutinas
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Ultima corrida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastRun ? (
              <>
                <p className="text-lg font-semibold">{statusLabel(lastRun.status)}</p>
                <p className="text-muted-foreground text-sm">
                  {formatDateTime(lastRun.started_at)} · {lastRun.raw_inserted ?? 0} insertadas ·{" "}
                  {lastRun.duplicates_removed ?? 0} duplicadas
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Todavia no hay corridas.</p>
            )}
            <Button variant="outline" size="sm" render={<Link href="/engine/graph" />}>
              <NetworkIcon />
              Ver el grafo
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Horario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.enabled && settings.run_hours.length > 0 ? (
              <>
                <p className="text-lg font-semibold tabular-nums">
                  {settings.run_hours
                    .map((hour) => `${String(hour).padStart(2, "0")}:00`)
                    .join(" · ")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {settings.timezone}
                  {upcoming.length ? ` · proxima ${upcoming[0]}` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Desactivado</p>
                <p className="text-muted-foreground text-sm">
                  El motor solo corre cuando lo lanzas a mano.
                </p>
              </>
            )}
            <Button variant="outline" size="sm" render={<Link href="/engine/schedule" />}>
              <ClockIcon />
              Cambiar horario
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin eventos registrados todavia. Se llenan solos en cuanto corra el motor.
            </p>
          ) : (
            <ol className="divide-y">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {event.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{event.label}</span>
                  <time className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTime(event.at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
