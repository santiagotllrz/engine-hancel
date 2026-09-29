"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * CRUD de las capas del bloque 1.
 *
 * Todas escriben con la service role y acotan a la cuenta abierta: el id del
 * padre o de la fila llega del cliente, y sin el filtro por cuenta cualquiera
 * con sesion podria tocar las capas de otra pasando un id a mano.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/capas")
}

const TABLAS = [
  "content_pillars",
  "content_topics",
  "content_subtopics",
  "content_intents",
  "content_narratives",
  "content_ctas",
] as const
type Tabla = (typeof TABLAS)[number]

/**
 * Crea o actualiza una fila de una capa.
 *
 * `id` vacio crea; con id, actualiza esa fila de la cuenta. `extra` lleva la
 * relacion con el padre (pillar_id para un tema, topic_id para un subtema) solo
 * al crear: mover una fila de padre no es una edicion, es otra cosa.
 */
export async function guardarFila(
  tabla: Tabla,
  campos: { id?: string; name: string; description?: string | null },
  extra?: Record<string, string>
): Promise<ActionResult> {
  if (!TABLAS.includes(tabla)) return { ok: false, error: "Capa desconocida." }

  const name = campos.name.trim()
  if (!name) return { ok: false, error: "El nombre no puede quedar vacio." }

  const description =
    typeof campos.description === "string" && campos.description.trim().length > 0
      ? campos.description.trim()
      : null

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    if (campos.id) {
      const { error } = await supabase
        .from(tabla)
        .update({ name, description, updated_at: new Date().toISOString() })
        .eq("id", campos.id)
        .eq("account_id", accountId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from(tabla)
        .insert({ account_id: accountId, name, description, ...(extra ?? {}) })
      if (error) throw new Error(error.message)
    }

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar.")
  }
}

/** Borra una fila de una capa. El borrado en cascada se lleva sus hijos. */
export async function borrarFila(tabla: Tabla, id: string): Promise<ActionResult> {
  if (!TABLAS.includes(tabla)) return { ok: false, error: "Capa desconocida." }
  if (!id) return { ok: false, error: "Falta el id." }

  try {
    const { error } = await supabaseAdmin()
      .from(tabla)
      .delete()
      .eq("id", id)
      .eq("account_id", await idDeCuentaActual())
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar.")
  }
}

/**
 * Enciende o apaga la narrativa que una intencion desbloquea.
 *
 * Es una relacion, no una fila: elegir una intencion deja disponibles solo las
 * narrativas marcadas aqui. Se comprueba que las dos partes son de la cuenta
 * antes de enlazarlas, para no cruzar capas de cuentas distintas.
 */
export async function alternarNarrativa(
  intentId: string,
  narrativeId: string,
  activar: boolean
): Promise<ActionResult> {
  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    if (activar) {
      const { count } = await supabase
        .from("content_narratives")
        .select("id", { count: "exact", head: true })
        .eq("id", narrativeId)
        .eq("account_id", accountId)
      if (!count) return { ok: false, error: "Esa narrativa no es de esta cuenta." }

      const { error } = await supabase
        .from("content_intent_narratives")
        .upsert(
          { account_id: accountId, intent_id: intentId, narrative_id: narrativeId },
          { onConflict: "intent_id,narrative_id" }
        )
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from("content_intent_narratives")
        .delete()
        .eq("account_id", accountId)
        .eq("intent_id", intentId)
        .eq("narrative_id", narrativeId)
      if (error) throw new Error(error.message)
    }

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar la relacion.")
  }
}
