"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { correrRecetas } from "@/engine/studio/generar"
import { getSettings } from "@/engine/schedule"
import { canalPorId, formatoPorId } from "@/lib/canales-catalogo"

/**
 * CRUD de las recetas y el disparo manual del agente de contenido.
 *
 * Todo se acota a la cuenta abierta: el id del pilar o de la receta llega del
 * cliente y sin el filtro por cuenta se podrian tocar recetas ajenas.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

export type CamposReceta = {
  id?: string
  name: string
  pillar_id: string
  channel: string
  format: string
  generator: string
  per_day: number
  run_at: number[]
  brand_template_id?: string | null
  campos?: Record<string, string> | null
}

/** Crea o actualiza una receta, validando que canal y formato existan y casen. */
export async function guardarReceta(campos: CamposReceta): Promise<ActionResult> {
  const name = campos.name.trim()
  if (!name) return { ok: false, error: "La receta necesita un nombre." }
  if (!campos.pillar_id) return { ok: false, error: "Elige un pilar." }

  const canal = canalPorId(campos.channel)
  if (!canal) return { ok: false, error: "Canal desconocido." }
  const fmt = formatoPorId(campos.format)
  if (!fmt || fmt.canal.id !== canal.id) {
    return { ok: false, error: "Ese formato no es de ese canal." }
  }

  const perDay = Math.min(20, Math.max(1, Math.round(campos.per_day || 1)))
  const runAt = [...new Set(campos.run_at)]
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b)

  const template: Record<string, unknown> = {}
  if (campos.brand_template_id?.trim()) template.brand_template_id = campos.brand_template_id.trim()
  if (campos.campos && Object.keys(campos.campos).length > 0) template.campos = campos.campos

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    // El pilar tiene que ser de la cuenta: llega del cliente.
    const { count } = await supabase
      .from("content_pillars")
      .select("id", { count: "exact", head: true })
      .eq("id", campos.pillar_id)
      .eq("account_id", accountId)
    if (!count) return { ok: false, error: "Ese pilar no es de esta cuenta." }

    const fila = {
      account_id: accountId,
      name,
      pillar_id: campos.pillar_id,
      channel: canal.id,
      format: fmt.formato.id,
      generator: campos.generator === "canva" ? "canva" : "ninguno",
      per_day: perDay,
      run_at: runAt,
      template: Object.keys(template).length > 0 ? template : null,
      updated_at: new Date().toISOString(),
    }

    if (campos.id) {
      const { error } = await supabase
        .from("content_recipes")
        .update(fila)
        .eq("id", campos.id)
        .eq("account_id", accountId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from("content_recipes").insert(fila)
      if (error) throw new Error(error.message)
    }

    revalidatePath("/recetas")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la receta.")
  }
}

export async function borrarReceta(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id." }
  try {
    const { error } = await supabaseAdmin()
      .from("content_recipes")
      .delete()
      .eq("id", id)
      .eq("account_id", await idDeCuentaActual())
    if (error) throw new Error(error.message)
    revalidatePath("/recetas")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la receta.")
  }
}

export async function alternarReceta(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("content_recipes")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("account_id", await idDeCuentaActual())
    if (error) throw new Error(error.message)
    revalidatePath("/recetas")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar la receta.")
  }
}

/**
 * Guarda los prompts del pipeline nuevo para esta cuenta.
 *
 * Vacio significa "usa el del codigo": se guarda null, no una cadena vacia, para
 * que el agente vuelva al prompt por defecto en vez de trabajar sin instrucciones.
 */
export async function guardarPromptsEstudio(campos: {
  ideas_prompt: string
  content_prompt: string
}): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("studio_settings")
      .upsert(
        {
          account_id: await idDeCuentaActual(),
          ideas_prompt: campos.ideas_prompt.trim() || null,
          content_prompt: campos.content_prompt.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      )
    if (error) throw new Error(error.message)
    revalidatePath("/recetas")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudieron guardar los prompts.")
  }
}

/**
 * Guarda la conexion de Canva (connected account de Composio).
 *
 * Es maquinaria compartida, como la clave de Composio: una sola conexion sirve a
 * todas las cuentas, asi que vive en el singleton engine_secrets, no por cuenta.
 */
export async function guardarCanva(connectedAccountId: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("engine_secrets")
      .update({
        canva_connected_account_id: connectedAccountId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
    if (error) throw new Error(error.message)
    revalidatePath("/recetas")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la conexion de Canva.")
  }
}

export type GenerarResult =
  | { ok: true; generadas: number; errores: number; motivo?: string }
  | { ok: false; error: string }

/**
 * Dispara una receta a mano, saltando horario y candado de hora.
 *
 * Reclama hasta lo que falte del cupo del dia y genera. Sirve para probar una
 * receta recien creada sin esperar a su hora.
 */
export async function generarAhora(recipeId: string): Promise<GenerarResult> {
  if (!recipeId) return { ok: false, error: "Falta la receta." }
  try {
    const accountId = await idDeCuentaActual()
    const { count } = await supabaseAdmin()
      .from("content_recipes")
      .select("id", { count: "exact", head: true })
      .eq("id", recipeId)
      .eq("account_id", accountId)
    if (!count) return { ok: false, error: "Esa receta no es de esta cuenta." }

    const { timezone } = await getSettings(accountId)
    const r = await correrRecetas({
      accountId,
      timezone,
      force: true,
      recipeId,
      // A mano se permite vaciar el cupo del dia de una receta de golpe.
      presupuesto: 20,
    })
    const res = r[0]
    if (!res) return { ok: false, error: "La receta no produjo nada." }

    revalidatePath("/recetas")
    return { ok: true, generadas: res.generadas, errores: res.errores, motivo: res.motivo }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudo generar." }
  }
}
