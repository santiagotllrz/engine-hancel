import { supabaseAdmin } from "../supabase-admin"
import { generarRonda, type ResultadoIdeas } from "./generar"
import { studioConfig } from "../studio/settings"

/**
 * La cadencia del agente de ideas.
 *
 * Las ideas no se generan por reloj sino por despensa: cada pilar tiene un ritmo
 * de consumo (la suma de per_day de sus recetas encendidas) y se rellena cuando
 * quedan menos de siete dias de cartuchos por delante. Asi nunca falta material
 * para el agente de contenido, y no se acumulan cientos de ideas que envejecen.
 *
 * Un pilar sin recetas no consume, asi que no se rellena: generar ideas que
 * nadie va a usar solo gasta tokens.
 */

const DIAS_COLCHON = 7

export type ResultadoCadencia = {
  pillarId: string
  rellenado: boolean
  motivo: string
  ideas?: ResultadoIdeas
}

export async function asegurarCartuchos(accountId: string): Promise<ResultadoCadencia[]> {
  const supabase = supabaseAdmin()

  const [pilares, recetas, cartuchos] = await Promise.all([
    supabase.from("content_pillars").select("id").eq("account_id", accountId),
    supabase.from("content_recipes").select("pillar_id, per_day").eq("account_id", accountId).eq("enabled", true),
    supabase.from("content_cartridges").select("pillar_id").eq("account_id", accountId).eq("status", "available"),
  ])

  const consumo = new Map<string, number>()
  for (const r of (recetas.data ?? []) as { pillar_id: string; per_day: number }[]) {
    consumo.set(r.pillar_id, (consumo.get(r.pillar_id) ?? 0) + (r.per_day || 0))
  }
  const disponibles = new Map<string, number>()
  for (const c of (cartuchos.data ?? []) as { pillar_id: string }[]) {
    disponibles.set(c.pillar_id, (disponibles.get(c.pillar_id) ?? 0) + 1)
  }

  const { modelIdeas, promptIdeas } = await studioConfig(accountId)
  const salida: ResultadoCadencia[] = []

  for (const p of (pilares.data ?? []) as { id: string }[]) {
    const porDia = consumo.get(p.id) ?? 0
    if (porDia <= 0) {
      salida.push({ pillarId: p.id, rellenado: false, motivo: "sin recetas que consuman" })
      continue
    }
    const dias = (disponibles.get(p.id) ?? 0) / porDia
    if (dias >= DIAS_COLCHON) {
      salida.push({ pillarId: p.id, rellenado: false, motivo: `quedan ${dias.toFixed(1)} dias` })
      continue
    }

    const ideas = await generarRonda(accountId, p.id, modelIdeas, promptIdeas)
    salida.push({
      pillarId: p.id,
      rellenado: !ideas.error && ideas.generadas > 0,
      motivo: ideas.error ?? `ronda ${ideas.ronda}: ${ideas.generadas} ideas`,
      ideas,
    })
  }

  return salida
}
