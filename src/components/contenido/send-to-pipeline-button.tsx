"use client"

import * as React from "react"

import { sendToPipeline, type ActionResult } from "@/app/contenido/actions"
import { Button } from "@/components/ui/button"
import { Loader2Icon, PenLineIcon } from "lucide-react"

/**
 * Manda una noticia al pipeline de contenido.
 *
 * Disponible en cualquier noticia, en cualquier modo y sin importar el umbral:
 * es una accion del usuario, no de la seleccion automatica. Por eso vive tanto
 * en la lista de candidatas como en `/noticias`.
 *
 * No espera a que la rutina trabaje, solo a que el trabajo quede encolado: el
 * angulo aparece despues, cuando la rutina responde y el tick lo materializa.
 */
export function SendToPipelineButton({
  rawNewsId,
  size = "sm",
  variant = "outline",
}: {
  rawNewsId: string
  size?: "sm" | "default"
  variant?: "outline" | "secondary"
}) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant={variant}
        disabled={pending || result?.ok === true}
        onClick={() => {
          setResult(null)
          startTransition(async () => setResult(await sendToPipeline(rawNewsId)))
        }}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
        {pending ? "Enviando…" : result?.ok ? "En cola" : "Generar contenido"}
      </Button>

      {result && !result.ok ? (
        <span role="status" aria-live="polite" className="text-destructive truncate text-xs">
          {result.error}
        </span>
      ) : null}
    </div>
  )
}
