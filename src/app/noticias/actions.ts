"use server"

import { revalidatePath } from "next/cache"

import { analizarPendientes } from "@/engine/content/analisis"
import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

export type AnalyzeAllResult =
  | { ok: true; analizadas: number; pendientes: number }
  | { ok: false; error: string }

/**
 * Analiza a mano una tanda de pendientes, sin esperar al tick.
 *
 * Antes disparaba la rutina externa; ahora el motor investiga y puntua aqui
 * mismo con Claude. Procesa una tanda (no todas de golpe, para no colgar la
 * accion) y devuelve cuantas hizo y cuantas quedan; el tick sigue con el resto.
 */
export async function analyzeAllNews(): Promise<AnalyzeAllResult> {
  try {
    const accountId = await idDeCuentaActual()

    const res = await analizarPendientes(accountId, 8)

    const { count } = await supabaseAdmin()
      .from("raw_news")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "pending_analysis")

    revalidatePath("/noticias")
    return { ok: true, analizadas: res.analizadas, pendientes: count ?? 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudo analizar." }
  }
}
