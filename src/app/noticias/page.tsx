import { Suspense } from "react"

import { DashboardShell } from "@/components/dashboard-shell"
import { NewsFilters } from "@/components/news-filters"
import { NewsList } from "@/components/news-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { buildStats, getFacets, getNews } from "@/lib/news"

// Los datos cambian con cada corrida del pipeline: nada que prerenderizar.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Noticias · Engine Hancel",
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const [news, facets] = await Promise.all([
    getNews({ niche: first("niche"), status: first("status"), q: first("q") }),
    getFacets(),
  ])
  const stats = buildStats(news)

  return (
    <DashboardShell title="Noticias">
      <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Noticias" value={formatNumber(stats.total)} />
        <StatCard
          label="Con contenido completo"
          value={formatNumber(stats.withContent)}
        />
        <StatCard label="Analizadas" value={formatNumber(stats.analyzed)} />
        <StatCard label="Fuentes distintas" value={formatNumber(stats.sources)} />
      </div>

      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <NewsFilters niches={facets.niches} statuses={facets.statuses} />
      </Suspense>

      <NewsList items={news} />
    </DashboardShell>
  )
}
