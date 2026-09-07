"use client"

import * as React from "react"

import { analyzeAllNews, type AnalyzeAllResult } from "@/app/noticias/actions"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { Loader2Icon, SparklesIcon } from "lucide-react"

/**
 * Dispara la rutina de analisis a mano.
 *
 * No espera a que la rutina haga su trabajo, solo a que acuse recibo: el
 * analisis ocurre despues y fuera de esta app, y las noticias van cambiando de
 * estado por su cuenta. Por eso el mensaje dice "disparada" y no "analizadas".
 */
export function AnalyzeAllButton() {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<AnalyzeAllResult | null>(null)

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <p
        role="status"
        aria-live="polite"
        className={
          result?.ok === false
            ? "text-destructive min-w-0 truncate text-sm"
            : "text-muted-foreground min-w-0 truncate text-sm"
        }
      >
        {result === null
          ? null
          : result.ok
            ? result.pending > 0
              ? `Rutina disparada sobre ${formatNumber(result.pending)} noticias pendientes.`
              : "Rutina disparada (no habia noticias pendientes)."
            : result.error}
      </p>

      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setResult(null)
          startTransition(async () => setResult(await analyzeAllNews()))
        }}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {pending ? "Disparando…" : "Analizar todas"}
      </Button>
    </div>
  )
}
