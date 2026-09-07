"use server"

import { revalidatePath } from "next/cache"

import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * Acciones de servidor para editar la configuracion del motor.
 *
 * Todas escriben con el cliente service-role, que solo existe en el servidor:
 * el navegador manda la intencion, nunca la credencial.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/engine")
  revalidatePath("/engine/config")
  revalidatePath("/engine/routines")
  revalidatePath("/engine/graph")
}


/** URL vacia se acepta (borrador); si viene, tiene que ser https. */
function validateWebhook(url: string): string | null {
  if (!url) return null
  try {
    if (new URL(url).protocol !== "https:") {
      return "El webhook debe ser https: el token viaja en la peticion."
    }
  } catch {
    return "La URL del webhook no es valida."
  }
  return null
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim()
}

// --------------------------------------------------------------- categorias

export async function createCategory(form: FormData): Promise<ActionResult> {
  const name = text(form, "name")
  const slug = text(form, "slug")

  if (!name) return { ok: false, error: "El nombre es obligatorio." }
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    return {
      ok: false,
      error: "El slug solo admite letras, numeros, guion y guion bajo (se guarda en raw_news.niche).",
    }
  }

  try {
    const supabase = supabaseAdmin()
    const { count } = await supabase
      .from("engine_categories")
      .select("id", { count: "exact", head: true })

    const { error } = await supabase.from("engine_categories").insert({
      name,
      slug,
      description: text(form, "description") || null,
      color: text(form, "color") || "#8b8b8b",
      position: count ?? 0,
    })

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo crear la categoria.")
  }
}

export async function updateCategory(form: FormData): Promise<ActionResult> {
  const id = text(form, "id")
  const name = text(form, "name")
  if (!id) return { ok: false, error: "Falta el id de la categoria." }
  if (!name) return { ok: false, error: "El nombre es obligatorio." }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_categories")
      .update({
        name,
        description: text(form, "description") || null,
        color: text(form, "color") || "#8b8b8b",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo actualizar la categoria.")
  }
}

export async function toggleCategory(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("engine_categories")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado.")
  }
}

/** Borra la categoria y, en cascada, sus segmentos. Las noticias no se tocan. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("engine_categories").delete().eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la categoria.")
  }
}

// ---------------------------------------------------------------- segmentos

export async function createSegment(form: FormData): Promise<ActionResult> {
  const categoryId = text(form, "category_id")
  const label = text(form, "label")
  const query = text(form, "query")

  if (!categoryId) return { ok: false, error: "Falta la categoria." }
  if (!label) return { ok: false, error: "El nombre del segmento es obligatorio." }
  if (!query) return { ok: false, error: "La keyword de busqueda es obligatoria." }

  try {
    const supabase = supabaseAdmin()
    const { count } = await supabase
      .from("engine_segments")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)

    const { error } = await supabase.from("engine_segments").insert({
      category_id: categoryId,
      label,
      query,
      hl: text(form, "hl") || "en",
      gl: text(form, "gl") || "us",
      num: Number(text(form, "num")) || 15,
      freshness: text(form, "freshness") || "qdr:d",
      position: count ?? 0,
    })

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "Ya existe un segmento con ese nombre en esta categoria."
          : error.message
      )
    }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo crear el segmento.")
  }
}

export async function updateSegment(form: FormData): Promise<ActionResult> {
  const id = text(form, "id")
  const label = text(form, "label")
  const query = text(form, "query")

  if (!id) return { ok: false, error: "Falta el id del segmento." }
  if (!label) return { ok: false, error: "El nombre del segmento es obligatorio." }
  if (!query) return { ok: false, error: "La keyword de busqueda es obligatoria." }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_segments")
      .update({
        label,
        query,
        hl: text(form, "hl") || "en",
        gl: text(form, "gl") || "us",
        num: Number(text(form, "num")) || 15,
        freshness: text(form, "freshness") || "qdr:d",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo actualizar el segmento.")
  }
}

export async function toggleSegment(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("engine_segments")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado.")
  }
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("engine_segments").delete().eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar el segmento.")
  }
}

// ----------------------------------------------------------------- rutinas

export async function createRoutine(form: FormData): Promise<ActionResult> {
  const name = text(form, "name")
  const webhookUrl = text(form, "webhook_url")

  if (!name) return { ok: false, error: "El nombre es obligatorio." }

  // URL vacia = borrador: la rutina existe pero no se puede invocar todavia.
  const urlError = validateWebhook(webhookUrl)
  if (urlError) return { ok: false, error: urlError }

  try {
    const { error } = await supabaseAdmin().from("engine_routines").insert({
      name,
      kind: text(form, "kind") || "analysis",
      webhook_url: webhookUrl || null,
      token: text(form, "token") || null,
      is_active: Boolean(webhookUrl),
    })

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo crear la rutina.")
  }
}

export async function updateRoutine(form: FormData): Promise<ActionResult> {
  const id = text(form, "id")
  const name = text(form, "name")
  const webhookUrl = text(form, "webhook_url")
  const token = text(form, "token")

  if (!id) return { ok: false, error: "Falta el id de la rutina." }
  if (!name) return { ok: false, error: "El nombre es obligatorio." }

  const urlError = validateWebhook(webhookUrl)
  if (urlError) return { ok: false, error: urlError }

  try {
    // Token vacio = "dejalo como esta". Para borrarlo hay que escribir "-".
    const patch: Record<string, unknown> = {
      name,
      kind: text(form, "kind") || "analysis",
      webhook_url: webhookUrl || null,
      updated_at: new Date().toISOString(),
    }
    if (token === "-") patch.token = null
    else if (token) patch.token = token

    const { error } = await supabaseAdmin().from("engine_routines").update(patch).eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo actualizar la rutina.")
  }
}

export async function toggleRoutine(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    if (isActive) {
      // Activar una rutina sin URL la dejaria fallando en cada corrida.
      const { data } = await supabaseAdmin()
        .from("engine_routines")
        .select("webhook_url")
        .eq("id", id)
        .single()

      if (!(data as { webhook_url: string | null } | null)?.webhook_url) {
        return { ok: false, error: "Anade la URL del webhook antes de activarla." }
      }
    }

    const { error } = await supabaseAdmin()
      .from("engine_routines")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado.")
  }
}

export async function deleteRoutine(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("engine_routines").delete().eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la rutina.")
  }
}

/**
 * Llama el webhook con una carga de prueba, para verificar URL y token sin
 * tener que lanzar una ingesta completa.
 */
export async function testRoutine(id: string): Promise<ActionResult> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("engine_routines")
      .select("*")
      .eq("id", id)
      .single()

    if (error) throw new Error(error.message)

    const { callRoutine } = await import("@/engine/routines")
    const result = await callRoutine(data as never, {
      test: true,
      run_id: null,
      count: 0,
      news_ids: [],
    })

    refresh()
    return result.ok
      ? { ok: true }
      : { ok: false, error: result.error ?? `El webhook respondio ${result.status}.` }
  } catch (error) {
    return fail(error, "No se pudo probar la rutina.")
  }
}

// ----------------------------------------------------------------- horario

export async function updateSchedule(form: FormData): Promise<ActionResult> {
  const timezone = text(form, "timezone") || "America/Bogota"
  const enabled = form.get("enabled") === "on" || form.get("enabled") === "true"

  const hours = [
    ...new Set(
      String(form.get("run_hours") ?? "")
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23)
    ),
  ].sort((a, b) => a - b)

  const minute = Number(text(form, "run_minute"))

  try {
    // Falla pronto si la zona no existe, en vez de silenciarse en cada cron.
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone })
  } catch {
    return { ok: false, error: `La zona horaria "${timezone}" no es valida.` }
  }

  if (enabled && hours.length === 0) {
    return { ok: false, error: "Elige al menos una hora, o desactiva la programacion." }
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, error: "El minuto tiene que estar entre 0 y 59." }
  }

  try {
    // Guardar dispara el trigger que reprograma el job de pg_cron: el horario
    // de esta pantalla es el cron de verdad, no un filtro.
    const { error } = await supabaseAdmin()
      .from("engine_settings")
      .update({
        run_hours: hours,
        run_minute: minute,
        timezone,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)

    if (error) throw new Error(error.message)
    revalidatePath("/engine/schedule")
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el horario.")
  }
}
