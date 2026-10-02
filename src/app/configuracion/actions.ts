"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { enlaceConexionCanva } from "@/engine/studio/canva-conexion"

/**
 * Empieza la conexion con Canva: devuelve la url de Composio donde se inicia
 * sesion. Al terminar, Composio vuelve a Conexiones con `?canva=ok`.
 */
export async function conectarCanva(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return { ok: false, error: "No se pudo saber la direccion de la app." }
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return enlaceConexionCanva(`${proto}://${host}/configuracion/conexiones?canva=ok`)
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * La zona horaria de la cuenta.
 *
 * Lo unico que sobrevive de la pantalla de horario: las horas de ejecucion las
 * lleva ahora cada agente en su ficha, pero el huso sigue siendo uno solo para
 * toda la cuenta, porque es el que da sentido a todas esas horas. Tenerlo por
 * agente permitiria configurarlos en husos distintos, que no es una libertad
 * que nadie quiera y si una forma nueva de equivocarse.
 */
export async function updateTimezone(timezone: string): Promise<ActionResult> {
  const limpia = timezone.trim() || "America/Bogota"

  try {
    // Falla pronto si la zona no existe, en vez de silenciarse en cada pasada.
    new Intl.DateTimeFormat("en-GB", { timeZone: limpia })
  } catch {
    return { ok: false, error: `La zona horaria "${limpia}" no es valida.` }
  }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_settings")
      .update({ timezone: limpia, updated_at: new Date().toISOString() })
      .eq("account_id", await idDeCuentaActual())

    if (error) throw new Error(error.message)

    // El huso cambia lo que significa "las 11" en todas las fichas de agente.
    revalidatePath("/configuracion/general")
    revalidatePath("/agentes", "layout")
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudo guardar la zona horaria." }
  }
}
