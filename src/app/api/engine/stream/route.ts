import type { EngineEvent } from "@/engine/events"
import { dryRunIngestion, runIngestion } from "@/engine/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Una corrida a la vez por proceso.
 *
 * Dos ingestas solapadas se pisarian en la deduplicacion del dia y gastarian
 * cuota de Serper por duplicado.
 */
let running = false

/**
 * Solo desde la propia app.
 *
 * OJO: esto NO es autenticacion. El dashboard todavia no tiene login, asi que
 * cualquiera que pueda abrir la pagina puede lanzar una corrida. Frena llamadas
 * cruzadas desde otro sitio, nada mas.
 */
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return false

  const origin = request.headers.get("origin")
  if (!origin) return true

  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return new Response("Origen no permitido", { status: 403 })
  }
  if (running) {
    return new Response("Ya hay una corrida en curso", { status: 409 })
  }

  // La consola en vivo corre para la cuenta que el usuario tiene abierta. La
  // ruta esta detras del proxy de sesion, asi que aqui siempre hay una.
  const { idDeCuentaActual } = await import("@/lib/accounts")
  const accountId = await idDeCuentaActual()

  const mode = new URL(request.url).searchParams.get("mode") === "dry" ? "dry" : "run"
  const encoder = new TextEncoder()
  running = true

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type, payload })}\n\n`)
          )
        } catch {
          // El cliente cerro la pestana; la corrida sigue hasta terminar.
        }
      }

      const onEvent = (event: EngineEvent) => send("event", event)

      try {
        const summary =
          mode === "dry"
            ? await dryRunIngestion({ accountId, onEvent, signal: request.signal })
            : await runIngestion({ accountId, onEvent, signal: request.signal })

        send("summary", summary)
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        running = false
        send("done", { mode })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

/** Deja consultar si hay una corrida en curso sin lanzar otra. */
export async function GET() {
  return Response.json({ running })
}
