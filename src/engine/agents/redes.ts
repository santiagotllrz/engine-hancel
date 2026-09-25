import { getLinkedinStatus } from "../publish/linkedin"
import { supabaseAdmin } from "../supabase-admin"
import { ajustesDe, type Agente } from "./settings"

/**
 * Las redes que esta cuenta tiene de verdad en marcha.
 *
 * Dos condiciones, y las dos hacen falta: el agente en servicio y el canal
 * conectado. Vive aqui, en un solo sitio, porque la regla la usan dos partes
 * que no pueden discrepar: el tablero, para saber que columnas pintar, y el
 * motor, para saber para que redes escribir.
 *
 * Cuando discrepaban pasaba justo esto: LinkedIn sin conectar seguia generando
 * posts porque su agente estaba en automatico, y esas piezas no aparecian en
 * ningun sitio ni podian publicarse. Se pagaba una generacion por cada una para
 * nada.
 */
export const REDES_POSIBLES = ["linkedin", "instagram", "facebook"] as const
export type RedPosible = (typeof REDES_POSIBLES)[number]

export async function redesActivas(accountId: string): Promise<RedPosible[]> {
  const supabase = supabaseAdmin()

  const { data: cuenta } = await supabase
    .from("accounts")
    .select("buffer_instagram_channel_id, buffer_facebook_channel_id")
    .eq("id", accountId)
    .maybeSingle()

  const canales = (cuenta ?? {}) as {
    buffer_instagram_channel_id: string | null
    buffer_facebook_channel_id: string | null
  }

  // Expirada cuenta como no conectada: un token caducado no publica, y seguir
  // escribiendo para esa red solo acumula piezas que no van a salir.
  const linkedin = await getLinkedinStatus(accountId)

  const conectada: Record<RedPosible, boolean> = {
    linkedin: linkedin.connected && !linkedin.expired,
    instagram: Boolean(canales.buffer_instagram_channel_id),
    facebook: Boolean(canales.buffer_facebook_channel_id),
  }

  const activas: RedPosible[] = []
  for (const red of REDES_POSIBLES) {
    if (!conectada[red]) continue
    // Facebook no tiene agente propio: viaja con el guion de Instagram y hereda
    // su interruptor.
    const agente: Agente = red === "facebook" ? "instagram" : red
    const ajustes = await ajustesDe(accountId, agente)
    if (ajustes.enabled) activas.push(red)
  }

  return activas
}

/** Las que ademas escriben solas, sin que nadie las dispare desde el tablero. */
export async function redesQueGeneranSolas(accountId: string): Promise<RedPosible[]> {
  const activas = await redesActivas(accountId)
  const salida: RedPosible[] = []

  for (const red of activas) {
    const agente: Agente = red === "facebook" ? "instagram" : red
    const ajustes = await ajustesDe(accountId, agente)
    if (ajustes.mode !== "manual") salida.push(red)
  }

  return salida
}
