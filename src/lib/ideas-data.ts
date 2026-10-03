import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import { todas } from "@/engine/paginar"

/**
 * Los cartuchos de la cuenta, agrupados por pilar.
 *
 * Solo se traen los disponibles para pintarlos: los usados ya son piezas y
 * viven en el otro flujo. Pero si se cuentan aparte, para saber cuanto se ha
 * consumido de cada pilar.
 */

export type Cartucho = {
  id: string
  idea: string
  notes: string | null
  round: number
  tema: string | null
  subtema: string | null
  intencion: string | null
  narrativa: string | null
}

export type PilarConIdeas = {
  id: string
  name: string
  disponibles: Cartucho[]
  totalUsados: number
}

export async function getIdeasPorPilar(): Promise<PilarConIdeas[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [pilares, cartuchos, temas, subtemas, intenciones, narrativas] = await Promise.all([
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position"),
    supabase.from("content_cartridges").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
    supabase.from("content_topics").select("id, name").eq("account_id", accountId),
    todas((d, h) => supabase.from("content_subtopics").select("id, name").eq("account_id", accountId).order("id").range(d, h)).then((data) => ({ data, error: null })),
    supabase.from("content_intents").select("id, name").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name").eq("account_id", accountId),
  ])

  const nombre = (data: unknown) =>
    new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
  const nTema = nombre(temas.data)
  const nSub = nombre(subtemas.data)
  const nInt = nombre(intenciones.data)
  const nNarr = nombre(narrativas.data)

  type Fila = {
    id: string
    pillar_id: string
    idea: string
    notes: string | null
    round: number
    status: string
    topic_id: string | null
    subtopic_id: string | null
    intent_id: string | null
    narrative_id: string | null
  }

  const dispPorPilar = new Map<string, Cartucho[]>()
  const usadosPorPilar = new Map<string, number>()

  for (const c of (cartuchos.data ?? []) as Fila[]) {
    if (c.status === "used") {
      usadosPorPilar.set(c.pillar_id, (usadosPorPilar.get(c.pillar_id) ?? 0) + 1)
      continue
    }
    const lista = dispPorPilar.get(c.pillar_id) ?? []
    lista.push({
      id: c.id,
      idea: c.idea,
      notes: c.notes,
      round: c.round,
      tema: c.topic_id ? (nTema.get(c.topic_id) ?? null) : null,
      subtema: c.subtopic_id ? (nSub.get(c.subtopic_id) ?? null) : null,
      intencion: c.intent_id ? (nInt.get(c.intent_id) ?? null) : null,
      narrativa: c.narrative_id ? (nNarr.get(c.narrative_id) ?? null) : null,
    })
    dispPorPilar.set(c.pillar_id, lista)
  }

  return ((pilares.data ?? []) as { id: string; name: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
    disponibles: dispPorPilar.get(p.id) ?? [],
    totalUsados: usadosPorPilar.get(p.id) ?? 0,
  }))
}
