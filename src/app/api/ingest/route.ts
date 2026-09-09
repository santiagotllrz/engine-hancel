import { NextResponse } from "next/server"

import { runIngestion } from "@/engine/ingest"
import { decide, getSettings } from "@/engine/schedule"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * El scheduler externo llama cada hora y aqui se decide si toca correr.
 *
 * Asi los horarios se cambian desde /engine/schedule sin volver a desplegar.
 * `?force=1` salta la comprobacion, para disparos manuales.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
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
