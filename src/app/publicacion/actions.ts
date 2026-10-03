"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * Los ajustes del agente de publicacion del estudio. Es un agente aparte del de
 * las noticias (Agentes -> Publicacion): publica lo que producen las recetas.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

/** Los ajustes del agente de publicacion del estudio, para esta cuenta. */
export async function guardarPublicacion(campos: {
  activo: boolean
  desde: string
  cadaMin: number
  redes: string[]
}): Promise<ActionResult> {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(campos.desde)) return { ok: false, error: "La hora de inicio va como 09:30." }
  const cada = Math.round(campos.cadaMin)
  if (!Number.isFinite(cada) || cada < 5 || cada > 240) return { ok: false, error: "El intervalo va de 5 a 240 minutos." }
  const redes = campos.redes.filter((r) => r === "instagram" || r === "facebook")
  if (campos.activo && redes.length === 0) return { ok: false, error: "Elige al menos una red." }
  try {
    const { error } = await supabaseAdmin()
      .from("studio_settings")
      .upsert(
        {
          account_id: await idDeCuentaActual(),
          publicar_activo: campos.activo,
          publicar_desde: campos.desde.padStart(5, "0"),
          publicar_cada_min: cada,
          publicar_redes: redes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      )
    if (error) throw new Error(error.message)
    revalidatePath("/publicacion")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la publicación.")
  }
}
