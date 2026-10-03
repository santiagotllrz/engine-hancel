import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { dayIn, getSettings } from "@/engine/schedule"
import { ajustesPublicacion, planDelDia, type AjustesPublicacion } from "@/engine/studio/publicar"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que la pestaña de publicacion muestra: los ajustes del agente y el plan de
 * hoy, hueco por hueco, con la pieza que le toco y como va en cada red.
 */

export type EstadoRed = { status: string; error: string | null } | null

export type HuecoVista = {
  slot: number
  hora: string
  pilar: string
  receta: string
  pieza: string | null
  instagram: EstadoRed
  facebook: EstadoRed
}

export type PublicacionVista = {
  ajustes: AjustesPublicacion
  dia: string
  timezone: string
  huecos: HuecoVista[]
}

export async function getPublicacion(): Promise<PublicacionVista> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()
  const [ajustes, { timezone }] = await Promise.all([ajustesPublicacion(accountId), getSettings(accountId)])
  const dia = dayIn(timezone, new Date())

  const [recetas, pilares, filas] = await Promise.all([
    supabase.from("content_recipes").select("id, name, pillar_id, per_day, channel, created_at").eq("account_id", accountId).eq("enabled", true),
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position").order("name"),
    supabase.from("studio_publications").select("slot, red, status, error, due_at, piece_id").eq("account_id", accountId).eq("dia", dia),
  ])
  const losPilares = (pilares.data ?? []) as { id: string; name: string }[]
  const plan = planDelDia(
    (recetas.data ?? []) as Parameters<typeof planDelDia>[0],
    losPilares.map((p) => p.id),
    ajustes,
    dia,
    timezone
  )
  const lasFilas = (filas.data ?? []) as { slot: number; red: string; status: string; error: string | null; due_at: string | null; piece_id: string }[]

  const ids = [...new Set(lasFilas.map((f) => f.piece_id))]
  const { data: piezas } = ids.length
    ? await supabase.from("studio_pieces").select("id, payload").in("id", ids)
    : { data: [] }
  const tituloDe = new Map(
    ((piezas ?? []) as { id: string; payload: { slides?: { hook?: string; title?: string }[] } | null }[]).map((p) => [
      p.id,
      (p.payload?.slides?.[0]?.hook || p.payload?.slides?.[0]?.title || "").replace(/\*/g, ""),
    ])
  )
  const hora = (d: Date) => d.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })

  return {
    ajustes,
    dia,
    timezone,
    huecos: plan.map((h) => {
      const suyas = lasFilas.filter((f) => f.slot === h.slot)
      const red = (r: string): EstadoRed => {
        const f = suyas.find((x) => x.red === r)
        return f ? { status: f.status, error: f.error } : null
      }
      const due = suyas.find((f) => f.due_at)?.due_at
      return {
        slot: h.slot,
        // Si salio en otro hueco porque su pieza llego tarde, se ve la hora real.
        hora: hora(due ? new Date(due) : h.at),
        pilar: losPilares.find((p) => p.id === h.receta.pillar_id)?.name ?? "",
        receta: h.receta.name,
        pieza: suyas[0] ? (tituloDe.get(suyas[0].piece_id) ?? null) : null,
        instagram: red("instagram"),
        facebook: red("facebook"),
      }
    }),
  }
}
