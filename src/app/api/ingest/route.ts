import { NextResponse } from "next/server"

import { runIngestion } from "@/engine/ingest"
import { decide, getSettings } from "@/engine/schedule"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Autorizacion del endpoint.
 *
 * Falla cerrado: sin `INGEST_SECRET` configurado nadie puede dispararlo. Un
 * endpoint que gasta cuota de Serper y escribe en la base no puede quedar
 * abierto por olvidar una variable de entorno.
 *
 * Acepta `Authorization: Bearer <secreto>` (que es como lo manda Vercel Cron)
 * y `x-ingest-secret`, para cualquier otro scheduler.
 */
function authorize(request: Request): string | null {
  const expected = process.env.INGEST_SECRET
  if (!expected) return "INGEST_SECRET no esta configurado en el servidor."

  const header = request.headers.get("authorization")
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null
  const provided = bearer ?? request.headers.get("x-ingest-secret")

  if (provided !== expected) return "Secreto invalido."
  return null
}

/**
 * El scheduler externo llama cada hora y aqui se decide si toca correr.
 *
 * Asi los horarios se cambian desde /engine/schedule sin volver a desplegar.
 * `?force=1` salta la comprobacion, para disparos manuales.
 */
async function handle(request: Request) {
  const denied = authorize(request)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 })
  }

  const force = new URL(request.url).searchParams.get("force") === "1"

  if (!force) {
    const settings = await getSettings()
    const decision = decide(settings, new Date())
    if (!decision.run) {
      return NextResponse.json({
        skipped: true,
        reason: decision.reason,
        hour: decision.hour,
        timezone: settings.timezone,
        runHours: settings.run_hours,
      })
    }
  }

  try {
    const summary = await runIngestion({ signal: request.signal })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return handle(request)
}

// Vercel Cron invoca por GET.
export async function GET(request: Request) {
  return handle(request)
}
