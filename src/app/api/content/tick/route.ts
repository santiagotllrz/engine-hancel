import { NextResponse } from "next/server"

import { runContentTick } from "@/engine/content/tick"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Solo base de datos y dos webhooks; no es una ingesta. */
export const maxDuration = 60

/**
 * "Despierta y revisa la cola de contenido".
 *
 * Lo llaman los triggers de Postgres cuando un buzon pasa a 'done' o 'failed',
 * cuando una noticia queda 'analyzed', y el cron de respaldo cada cinco minutos.
 * Ninguno transporta trabajo: todos dicen lo mismo y la pasada averigua sola que
 * hay que hacer. Por eso recibir el aviso dos veces es inofensivo.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 })
  }

  const url = new URL(request.url)
  const trigger = url.searchParams.get("trigger")

  try {
    const summary = await runContentTick({
      trigger: trigger === "cron" || trigger === "manual" ? trigger : "trigger",
      signal: request.signal,
    })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return handle(request)
}

/** pg_net usa POST; el GET esta para poder probarlo a mano. */
export async function GET(request: Request) {
  return handle(request)
}
