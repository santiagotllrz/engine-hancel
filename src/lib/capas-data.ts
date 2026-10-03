import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import { todas } from "@/engine/paginar"

/**
 * Lecturas de las capas del bloque 1, siempre acotadas a la cuenta abierta.
 *
 * Las capas describen de que puede hablar el contenido; los agentes las leen
 * para armar ideas. Aqui solo se leen: la escritura vive en las acciones, que
 * son las unicas que tocan la base con la service role.
 */

export type Fila = {
  id: string
  name: string
  description: string | null
  position: number
}

export type Pilar = Fila & { temas: Tema[] }
/** Los subtemas propios del tema; los que vienen de una lista se cuentan aparte. */
export type Tema = Fila & {
  pillar_id: string
  subtemas: Fila[]
  /** Las listas que usa el tema, con cuantos subtemas le aportan. */
  listas: { id: string; name: string; total: number }[]
}

export type ListaSubtemas = {
  id: string
  name: string
  elementos: { id: string; name: string }[]
  /** Cuantos temas la usan. */
  usos: number
}
export type Intencion = Fila & { narrativas: string[] }

/** El arbol pilar -> tema -> subtema de la cuenta, en orden. */
export async function getPilares(): Promise<Pilar[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [pilares, temas, subtemas, listas, enlaces] = await Promise.all([
    supabase.from("content_pillars").select("*").eq("account_id", accountId).order("position"),
    supabase.from("content_topics").select("*").eq("account_id", accountId).order("position"),
    todas((d, h) => supabase.from("content_subtopics").select("*").eq("account_id", accountId).order("position").order("id").range(d, h)).then((data) => ({ data, error: null })),
    supabase.from("content_subtopic_lists").select("id, name").eq("account_id", accountId),
    supabase.from("content_topic_lists").select("topic_id, list_id").eq("account_id", accountId),
  ])

  if (pilares.error) throw new Error(`No se pudieron leer los pilares: ${pilares.error.message}`)

  // Los subtemas que vienen de una lista no se listan uno a uno en el tema
  // (pueden ser cien): se cuentan por lista.
  const subPorTema = new Map<string, Fila[]>()
  const deListaPorTema = new Map<string, number>()
  for (const s of (subtemas.data ?? []) as (Fila & { topic_id: string; list_item_id: string | null })[]) {
    if (s.list_item_id) {
      deListaPorTema.set(s.topic_id, (deListaPorTema.get(s.topic_id) ?? 0) + 1)
      continue
    }
    const lista = subPorTema.get(s.topic_id) ?? []
    lista.push({ id: s.id, name: s.name, description: s.description, position: s.position })
    subPorTema.set(s.topic_id, lista)
  }

  const nombreLista = new Map(((listas.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]))
  const items = await todas<{ list_id: string }>((d, h) =>
    supabase.from("content_subtopic_list_items").select("list_id, id").eq("account_id", accountId).order("id").range(d, h)
  )
  const totalLista = new Map<string, number>()
  for (const it of items) totalLista.set(it.list_id, (totalLista.get(it.list_id) ?? 0) + 1)
  const listasPorTema = new Map<string, Tema["listas"]>()
  for (const e of (enlaces.data ?? []) as { topic_id: string; list_id: string }[]) {
    const lista = listasPorTema.get(e.topic_id) ?? []
    lista.push({ id: e.list_id, name: nombreLista.get(e.list_id) ?? "Lista", total: totalLista.get(e.list_id) ?? 0 })
    listasPorTema.set(e.topic_id, lista)
  }

  const temasPorPilar = new Map<string, Tema[]>()
  for (const t of (temas.data ?? []) as (Fila & { pillar_id: string })[]) {
    const lista = temasPorPilar.get(t.pillar_id) ?? []
    lista.push({ ...t, subtemas: subPorTema.get(t.id) ?? [], listas: listasPorTema.get(t.id) ?? [] })
    temasPorPilar.set(t.pillar_id, lista)
  }

  return ((pilares.data ?? []) as Fila[]).map((p) => ({
    ...p,
    temas: temasPorPilar.get(p.id) ?? [],
  }))
}

/** Las listas de subtemas de la cuenta, con sus elementos y cuantos temas las usan. */
export async function getListas(): Promise<ListaSubtemas[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()
  const [listas, items, enlaces] = await Promise.all([
    supabase.from("content_subtopic_lists").select("id, name").eq("account_id", accountId).order("created_at"),
    todas<{ id: string; name: string; list_id: string }>((d, h) =>
      supabase.from("content_subtopic_list_items").select("id, name, list_id").eq("account_id", accountId).order("position").order("id").range(d, h)
    ),
    supabase.from("content_topic_lists").select("list_id").eq("account_id", accountId),
  ])
  const usos = new Map<string, number>()
  for (const e of (enlaces.data ?? []) as { list_id: string }[]) usos.set(e.list_id, (usos.get(e.list_id) ?? 0) + 1)
  return ((listas.data ?? []) as { id: string; name: string }[]).map((l) => ({
    id: l.id,
    name: l.name,
    elementos: items.filter((i) => i.list_id === l.id).map((i) => ({ id: i.id, name: i.name })),
    usos: usos.get(l.id) ?? 0,
  }))
}

/** Las intenciones, cada una con los ids de las narrativas que desbloquea. */
export async function getIntenciones(): Promise<Intencion[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [intenciones, enlaces] = await Promise.all([
    supabase.from("content_intents").select("*").eq("account_id", accountId).order("position"),
    supabase.from("content_intent_narratives").select("intent_id, narrative_id").eq("account_id", accountId),
  ])

  if (intenciones.error) throw new Error(`No se pudieron leer las intenciones: ${intenciones.error.message}`)

  const porIntencion = new Map<string, string[]>()
  for (const e of (enlaces.data ?? []) as { intent_id: string; narrative_id: string }[]) {
    const lista = porIntencion.get(e.intent_id) ?? []
    lista.push(e.narrative_id)
    porIntencion.set(e.intent_id, lista)
  }

  return ((intenciones.data ?? []) as Fila[]).map((i) => ({
    ...i,
    narrativas: porIntencion.get(i.id) ?? [],
  }))
}

/** Una capa simple (narrativas, ctas): solo nombre, descripcion y orden. */
export async function getSimples(tabla: "content_narratives" | "content_ctas"): Promise<Fila[]> {
  const { data, error } = await supabaseAdmin()
    .from(tabla)
    .select("id, name, description, position")
    .eq("account_id", await idDeCuentaActual())
    .order("position")

  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  return (data ?? []) as Fila[]
}
