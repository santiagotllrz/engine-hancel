"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { construirEnCanva, releerDeCanva } from "@/engine/studio/plantillas"
import { admitePlantilla, normalizarEstilo, type EstiloPlantilla } from "@/lib/plantillas-catalogo"

/**
 * CRUD de la capa Plantilla y su construccion en Canva.
 *
 * Guardar solo guarda valores. Construir es lo que habla con Canva: escribe el
 * diseno maestro y lo deja listo para las recetas. Se separan porque construir
 * tarda (unos 30 segundos) y crea un diseno nuevo en Canva cada vez.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refrescar() {
  revalidatePath("/capas")
  revalidatePath("/recetas")
}

/** La plantilla tiene que ser de la cuenta abierta: el id llega del cliente. */
async function esDeLaCuenta(id: string): Promise<boolean> {
  const { count } = await supabaseAdmin()
    .from("content_templates")
    .select("id", { count: "exact", head: true })
    .eq("id", id)
    .eq("account_id", await idDeCuentaActual())
  return Boolean(count)
}

export async function guardarPlantilla(campos: {
  id?: string
  name: string
  format: string
  estilo: EstiloPlantilla
}): Promise<ActionResult> {
  const name = campos.name.trim()
  if (!name) return { ok: false, error: "La plantilla necesita un nombre." }
  if (!admitePlantilla(campos.format)) return { ok: false, error: "Ese formato no admite plantilla todavia." }

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()
    const fila = { name, format: campos.format, estilo: normalizarEstilo(campos.estilo), updated_at: new Date().toISOString() }

    if (campos.id) {
      if (!(await esDeLaCuenta(campos.id))) return { ok: false, error: "Esa plantilla no es de esta cuenta." }
      const { error } = await supabase.from("content_templates").update(fila).eq("id", campos.id)
      if (error) throw new Error(error.message)
      refrescar()
      return { ok: true, id: campos.id }
    }

    const { data, error } = await supabase
      .from("content_templates")
      .insert({ ...fila, account_id: accountId })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    refrescar()
    return { ok: true, id: (data as { id: string }).id }
  } catch (error) {
    return fail(error, "No se pudo guardar la plantilla.")
  }
}

/** Construye (o reconstruye) el diseno maestro en Canva con los valores guardados. */
export async function construirPlantilla(id: string): Promise<ActionResult> {
  try {
    if (!(await esDeLaCuenta(id))) return { ok: false, error: "Esa plantilla no es de esta cuenta." }
    const r = await construirEnCanva(id)
    refrescar()
    return r.ok ? { ok: true, id } : r
  } catch (error) {
    return fail(error, "No se pudo construir en Canva.")
  }
}

/** Vuelve a leer el diseno de Canva, despues de retocarlo a mano. */
export async function releerPlantilla(id: string): Promise<ActionResult> {
  try {
    if (!(await esDeLaCuenta(id))) return { ok: false, error: "Esa plantilla no es de esta cuenta." }
    const r = await releerDeCanva(id)
    refrescar()
    return r.ok ? { ok: true, id } : r
  } catch (error) {
    return fail(error, "No se pudo leer el diseno de Canva.")
  }
}

/** Borra la plantilla del sistema. El diseno se queda en Canva. */
export async function borrarPlantilla(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("content_templates")
      .delete()
      .eq("id", id)
      .eq("account_id", await idDeCuentaActual())
    if (error) throw new Error(error.message)
    refrescar()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la plantilla.")
  }
}
