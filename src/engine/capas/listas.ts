import { supabaseAdmin } from "../supabase-admin"

/**
 * Listas de subtemas reutilizables.
 *
 * Una lista ("Frutas", con 100 elementos) se escribe una vez y la usan los
 * temas que la necesiten. Cuando un tema usa una lista, cada elemento se
 * materializa como un subtema de ese tema, enlazado a su elemento: asi el
 * agente de ideas, los cartuchos y las fichas siguen viendo subtemas normales.
 * Cambiar la lista (anadir, renombrar, quitar) cambia esos subtemas en todos
 * los temas que la usan.
 *
 * Todo recibe la cuenta: las acciones de /capas la toman de la sesion.
 */

export type ActionResult = { ok: true; agregados?: number } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

/** Un elemento por linea; tambien acepta comas o punto y coma si van en una sola linea. */
function partir(texto: string): string[] {
  const lineas = texto.includes("\n") ? texto.split(/\r?\n/) : texto.split(/[;,]/)
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const l of lineas) {
    // Quita viñetas y numeraciones ("1. ", "2) ", "- ", "• "), no los numeros
    // que forman parte del nombre.
    const limpio = l.replace(/^\s*(\d+[.)]\s+|[-•*]\s*)/, "").trim()
    if (!limpio) continue
    const clave = limpio.toLowerCase()
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(limpio.slice(0, 120))
  }
  return salida
}

async function listaDeLaCuenta(listId: string, accountId: string) {
  const { count } = await supabaseAdmin()
    .from("content_subtopic_lists")
    .select("id", { count: "exact", head: true })
    .eq("id", listId)
    .eq("account_id", accountId)
  return Boolean(count)
}

/**
 * Pone al dia los subtemas que una lista genera en los temas que la usan:
 * crea los que falten y actualiza nombre, descripcion y orden. Los de
 * elementos borrados ya se fueron solos (borrado en cascada).
 */
async function sincronizar(listId: string, accountId: string, soloTema?: string) {
  const supabase = supabaseAdmin()
  const [items, enlaces] = await Promise.all([
    supabase.from("content_subtopic_list_items").select("id, name, description, position").eq("list_id", listId),
    soloTema
      ? Promise.resolve({ data: [{ topic_id: soloTema }] })
      : supabase.from("content_topic_lists").select("topic_id").eq("list_id", listId),
  ])
  const elementos = (items.data ?? []) as { id: string; name: string; description: string | null; position: number }[]
  const temas = ((enlaces.data ?? []) as { topic_id: string }[]).map((e) => e.topic_id)
  if (elementos.length === 0 || temas.length === 0) return

  const { data: existentes } = await supabase
    .from("content_subtopics")
    .select("id, topic_id, list_item_id, name")
    .in("topic_id", temas)
    .in("list_item_id", elementos.map((e) => e.id))
  const hay = new Map(
    ((existentes ?? []) as { id: string; topic_id: string; list_item_id: string; name: string }[]).map((s) => [`${s.topic_id}:${s.list_item_id}`, s])
  )

  const nuevos: Record<string, unknown>[] = []
  for (const topic_id of temas) {
    for (const el of elementos) {
      const ya = hay.get(`${topic_id}:${el.id}`)
      if (!ya) {
        nuevos.push({ account_id: accountId, topic_id, list_item_id: el.id, name: el.name, description: el.description, position: 1000 + el.position })
      } else if (ya.name !== el.name) {
        await supabase.from("content_subtopics").update({ name: el.name, description: el.description, updated_at: new Date().toISOString() }).eq("id", ya.id)
      }
    }
  }
  // En tandas: una lista de 100 elementos en 10 temas son 1.000 filas.
  for (let i = 0; i < nuevos.length; i += 500) {
    const { error } = await supabase.from("content_subtopics").insert(nuevos.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
}

async function agregarElementos(listId: string, accountId: string, nombres: string[]) {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("content_subtopic_list_items").select("name, position").eq("list_id", listId)
  const actuales = (data ?? []) as { name: string; position: number }[]
  const ya = new Set(actuales.map((a) => a.name.toLowerCase()))
  let pos = actuales.reduce((m, a) => Math.max(m, a.position), 0)
  const filas = nombres
    .filter((n) => !ya.has(n.toLowerCase()))
    .map((name) => ({ account_id: accountId, list_id: listId, name, position: ++pos }))
  if (filas.length) {
    const { error } = await supabase.from("content_subtopic_list_items").insert(filas)
    if (error) throw new Error(error.message)
  }
  return filas.length
}

export async function crearLista(accountId: string, nombre: string, elementos: string): Promise<ActionResult> {
  const name = nombre.trim()
  if (!name) return { ok: false, error: "La lista necesita un nombre." }
  try {
    const { data, error } = await supabaseAdmin()
      .from("content_subtopic_lists")
      .insert({ account_id: accountId, name })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    const agregados = await agregarElementos((data as { id: string }).id, accountId, partir(elementos))
    return { ok: true, agregados }
  } catch (error) {
    return fail(error, "No se pudo crear la lista.")
  }
}

export async function renombrarLista(accountId: string, listId: string, nombre: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("content_subtopic_lists")
      .update({ name: nombre.trim(), updated_at: new Date().toISOString() })
      .eq("id", listId)
      .eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo renombrar la lista.")
  }
}

/** Borra la lista: sus subtemas desaparecen de todos los temas que la usaban. */
export async function borrarLista(accountId: string, listId: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("content_subtopic_lists").delete().eq("id", listId).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la lista.")
  }
}

/** Anade elementos (uno por linea) y los lleva a todos los temas que usan la lista. */
export async function anadirALista(accountId: string, listId: string, elementos: string): Promise<ActionResult> {
  try {
    if (!(await listaDeLaCuenta(listId, accountId))) return { ok: false, error: "Esa lista no es de esta cuenta." }
    const agregados = await agregarElementos(listId, accountId, partir(elementos))
    await sincronizar(listId, accountId)
    return { ok: true, agregados }
  } catch (error) {
    return fail(error, "No se pudieron anadir los elementos.")
  }
}

export async function renombrarElemento(accountId: string, itemId: string, nombre: string): Promise<ActionResult> {
  const name = nombre.trim()
  if (!name) return { ok: false, error: "El elemento necesita un nombre." }
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from("content_subtopic_list_items").update({ name }).eq("id", itemId).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    await supabase.from("content_subtopics").update({ name, updated_at: new Date().toISOString() }).eq("list_item_id", itemId).eq("account_id", accountId)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo renombrar el elemento.")
  }
}

/** Quita un elemento: su subtema desaparece de todos los temas que usan la lista. */
export async function borrarElemento(accountId: string, itemId: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("content_subtopic_list_items").delete().eq("id", itemId).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo quitar el elemento.")
  }
}

/** Un tema empieza a usar una lista: sus elementos pasan a ser subtemas del tema. */
export async function usarLista(accountId: string, topicId: string, listId: string): Promise<ActionResult> {
  try {
    const supabase = supabaseAdmin()
    const { count } = await supabase.from("content_topics").select("id", { count: "exact", head: true }).eq("id", topicId).eq("account_id", accountId)
    if (!count || !(await listaDeLaCuenta(listId, accountId))) return { ok: false, error: "El tema o la lista no son de esta cuenta." }
    const { error } = await supabase
      .from("content_topic_lists")
      .upsert({ account_id: accountId, topic_id: topicId, list_id: listId }, { onConflict: "topic_id,list_id" })
    if (error) throw new Error(error.message)
    await sincronizar(listId, accountId, topicId)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo usar la lista.")
  }
}

/** El tema deja de usar la lista: se van los subtemas que venian de ella. */
export async function quitarLista(accountId: string, topicId: string, listId: string): Promise<ActionResult> {
  try {
    const supabase = supabaseAdmin()
    const { data: items } = await supabase.from("content_subtopic_list_items").select("id").eq("list_id", listId).eq("account_id", accountId)
    const ids = ((items ?? []) as { id: string }[]).map((i) => i.id)
    if (ids.length) {
      for (let i = 0; i < ids.length; i += 300) {
        await supabase.from("content_subtopics").delete().eq("topic_id", topicId).eq("account_id", accountId).in("list_item_id", ids.slice(i, i + 300))
      }
    }
    const { error } = await supabase.from("content_topic_lists").delete().eq("topic_id", topicId).eq("list_id", listId).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo quitar la lista.")
  }
}

/** Varios subtemas propios de un tema de una vez: uno por linea. */
export async function subtemasEnBloque(accountId: string, topicId: string, texto: string): Promise<ActionResult> {
  try {
    const supabase = supabaseAdmin()
    const { count } = await supabase.from("content_topics").select("id", { count: "exact", head: true }).eq("id", topicId).eq("account_id", accountId)
    if (!count) return { ok: false, error: "Ese tema no es de esta cuenta." }
    const { data } = await supabase.from("content_subtopics").select("name, position").eq("topic_id", topicId)
    const actuales = (data ?? []) as { name: string; position: number }[]
    const ya = new Set(actuales.map((a) => a.name.toLowerCase()))
    let pos = actuales.reduce((m, a) => Math.max(m, a.position), 0)
    const filas = partir(texto)
      .filter((n) => !ya.has(n.toLowerCase()))
      .map((name) => ({ account_id: accountId, topic_id: topicId, name, position: ++pos }))
    if (filas.length) {
      const { error } = await supabase.from("content_subtopics").insert(filas)
      if (error) throw new Error(error.message)
    }
    return { ok: true, agregados: filas.length }
  } catch (error) {
    return fail(error, "No se pudieron crear los subtemas.")
  }
}
