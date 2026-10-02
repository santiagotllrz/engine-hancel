import { claveComposio, COMPOSIO_USER, estadoCanva } from "./canva-conexion"

/**
 * Llama a una herramienta del Canva MCP a traves de Composio.
 *
 * La conexion de Canva es la del servidor MCP oficial de Canva (toolkit
 * `canva_mcp`), no la API REST: por eso las herramientas son las de un agente
 * (copiar un diseno, abrir una transaccion de edicion, reemplazar textos y
 * fotos, exportar) y no el autofill de Canva Enterprise. Con ellas se hace lo
 * mismo que haria el autofill, en cualquier cuenta de Canva.
 *
 * No lanza: el fallo viaja en el resultado.
 */

const API = "https://backend.composio.dev/api/v3.1/tools/execute"

export type ResultadoMcp<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string }

type Contexto = { clave: string; cuenta: string }

let contexto: { valor: Contexto; hasta: number } | null = null

/** La clave y la cuenta conectada, cacheadas un minuto para no preguntar en cada paso. */
async function contextoCanva(): Promise<ResultadoMcp<Contexto>> {
  if (contexto && contexto.hasta > Date.now()) return { ok: true, data: contexto.valor }
  const clave = await claveComposio()
  if (!clave) return { ok: false, error: "Falta la clave de Composio." }
  const estado = await estadoCanva()
  if (!estado.conectado) {
    return { ok: false, error: `Canva: ${estado.motivo} Conectalo en Configuracion > Conexiones.` }
  }
  const valor = { clave, cuenta: estado.connectedAccountId }
  contexto = { valor, hasta: Date.now() + 60_000 }
  return { ok: true, data: valor }
}

export async function canvaMcp<T = Record<string, unknown>>(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 90_000
): Promise<ResultadoMcp<T>> {
  const ctx = await contextoCanva()
  if (!ctx.ok) return ctx

  // Las herramientas del MCP piden siempre una intencion: es para su registro.
  const conIntencion = { user_intent: "Motor de contenido de Engine Hancel", ...args }

  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(`${API}/${tool}`, {
        method: "POST",
        headers: { "x-api-key": ctx.data.clave, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: COMPOSIO_USER,
          connected_account_id: ctx.data.cuenta,
          arguments: conIntencion,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const json = (await res.json().catch(() => null)) as {
        successful?: boolean
        error?: string | { message?: string } | null
        data?: T
      } | null

      if (res.ok && json?.successful !== false && json?.data) return { ok: true, data: json.data }

      const error =
        (typeof json?.error === "string" ? json.error : json?.error?.message) || `Canva ${tool} respondio ${res.status}`
      // Un 429 o un 5xx de paso se reintenta una vez; un error del propio Canva no.
      if ((res.status === 429 || res.status >= 500) && intento === 0) {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      return { ok: false, error: error.slice(0, 500) }
    } catch (error) {
      if (intento === 0) continue
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: false, error: `Canva ${tool} no respondio.` }
}

// ------------------------------------------------------------------ tipos

export type TextoCanva = {
  element_id: string
  page_index: number
  regions?: { text?: string }[]
  containerElement?: { dimension?: { width: number; height: number } }
}

export type FillCanva = {
  element_id: string
  page_index: number
  type?: string
  alt_text?: { text?: string }
  containerElement?: { dimension?: { width: number; height: number } }
}

export type PaginaCanva = { page_id: string; page_number?: number; is_responsive: boolean }

export type Transaccion = {
  transaction: { transaction_id: string }
  pages: PaginaCanva[]
  richtexts: TextoCanva[]
  fills: FillCanva[]
}

/** El texto entero de un elemento de texto. */
export function textoDe(t: TextoCanva): string {
  return (t.regions ?? []).map((r) => r.text ?? "").join("")
}
