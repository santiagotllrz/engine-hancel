import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

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
export type Tema = Fila & { pillar_id: string; subtemas: Fila[] }
export type Intencion = Fila & { narrativas: string[] }

/** El arbol pilar -> tema -> subtema de la cuenta, en orden. */
export async function getPilares(): Promise<Pilar[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [pilares, temas, subtemas] = await Promise.all([
    supabase.from("content_pillars").select("*").eq("account_id", accountId).order("position"),
    supabase.from("content_topics").select("*").eq("account_id", accountId).order("position"),
    supabase.from("content_subtopics").select("*").eq("account_id", accountId).order("position"),
  ])

  if (pilares.error) throw new Error(`No se pudieron leer los pilares: ${pilares.error.message}`)

  const subPorTema = new Map<string, Fila[]>()
  for (const s of (subtemas.data ?? []) as (Fila & { topic_id: string })[]) {
    const lista = subPorTema.get(s.topic_id) ?? []
    lista.push({ id: s.id, name: s.name, description: s.description, position: s.position })
    subPorTema.set(s.topic_id, lista)
  }

  const temasPorPilar = new Map<string, Tema[]>()
  for (const t of (temas.data ?? []) as (Fila & { pillar_id: string })[]) {
    const lista = temasPorPilar.get(t.pillar_id) ?? []
    lista.push({ ...t, subtemas: subPorTema.get(t.id) ?? [] })
    temasPorPilar.set(t.pillar_id, lista)
  }

  return ((pilares.data ?? []) as Fila[]).map((p) => ({
    ...p,
    temas: temasPorPilar.get(p.id) ?? [],
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
