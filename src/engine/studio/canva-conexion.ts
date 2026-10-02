import { supabaseAdmin } from "../supabase-admin"

/**
 * La conexion con Canva, a traves de Composio.
 *
 * Dos identificadores distintos que es facil confundir:
 * - La auth config (`ac_...`) dice "esta es la configuracion de Canva en
 *   Composio". Es de la plataforma, no de una persona, y va fija en el codigo.
 * - La cuenta conectada (`ca_...`) es tu Canva autenticado. La crea Composio
 *   cuando inicias sesion desde el boton de Conexiones; nadie la escribe a mano.
 *
 * Una sola conexion sirve a todas las cuentas del motor, como la clave de
 * Composio: es la misma maquinaria trabajando para marcas distintas.
 */

const API = "https://backend.composio.dev/api/v3.1"

/** La auth config de Canva en Composio. Se puede sobreescribir por entorno. */
export const CANVA_AUTH_CONFIG = process.env.COMPOSIO_CANVA_AUTH_CONFIG_ID?.trim() || "ac_mF7f1F7XqvON"

/** El usuario de Composio bajo el que vive la conexion: el motor, no una cuenta. */
export const COMPOSIO_USER = "engine-hancel"

export async function claveComposio(): Promise<string | null> {
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("composio_api_key")
    .eq("id", true)
    .maybeSingle()
  return (data as { composio_api_key: string | null } | null)?.composio_api_key?.trim() || null
}

export type EstadoCanva =
  | { conectado: true; connectedAccountId: string }
  | { conectado: false; motivo: string }

/** Busca la cuenta de Canva activa del motor. Nunca lanza. */
export async function estadoCanva(): Promise<EstadoCanva> {
  const clave = await claveComposio()
  if (!clave) return { conectado: false, motivo: "Falta la clave de Composio." }

  try {
    const url = new URL(`${API}/connected_accounts`)
    url.searchParams.set("auth_config_ids", CANVA_AUTH_CONFIG)
    url.searchParams.set("user_ids", COMPOSIO_USER)
    url.searchParams.set("statuses", "ACTIVE")
    url.searchParams.set("order_by", "updated_at")
    url.searchParams.set("order_direction", "desc")
    url.searchParams.set("limit", "5")

    const res = await fetch(url, {
      headers: { "x-api-key": clave },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    if (!res.ok) return { conectado: false, motivo: `Composio respondio ${res.status}.` }

    const json = (await res.json()) as { items?: { id: string; status?: string }[] }
    const activa = (json.items ?? []).find((c) => !c.status || c.status === "ACTIVE")
    return activa
      ? { conectado: true, connectedAccountId: activa.id }
      : { conectado: false, motivo: "Canva no esta conectado." }
  } catch (error) {
    return { conectado: false, motivo: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Abre una sesion de autenticacion con Canva y devuelve la url a la que ir.
 *
 * Composio guarda la cuenta conectada al terminar y redirige a `callbackUrl`.
 */
export async function enlaceConexionCanva(
  callbackUrl: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const clave = await claveComposio()
  if (!clave) return { ok: false, error: "Falta la clave de Composio." }

  try {
    const res = await fetch(`${API}/connected_accounts/link`, {
      method: "POST",
      headers: { "x-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_config_id: CANVA_AUTH_CONFIG,
        user_id: COMPOSIO_USER,
        callback_url: callbackUrl,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const json = (await res.json().catch(() => null)) as {
      redirect_url?: string
      error?: { message?: string } | string
      message?: string
    } | null

    if (!res.ok || !json?.redirect_url) {
      const detalle =
        (typeof json?.error === "string" ? json.error : json?.error?.message) ?? json?.message
      return { ok: false, error: detalle || `Composio respondio ${res.status}.` }
    }
    return { ok: true, url: json.redirect_url }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
