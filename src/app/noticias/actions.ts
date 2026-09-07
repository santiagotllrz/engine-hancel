"use server"

import { revalidatePath } from "next/cache"

import { fireAnalysisRoutine } from "@/engine/analysis-routine"
import { supabaseAdmin } from "@/engine/supabase-admin"

export type AnalyzeAllResult =
  | { ok: true; pending: number }
  | { ok: false; error: string }

/**
 * Dispara la rutina de analisis a mano, sin lanzar una ingesta.
 *
 * Es el mismo gatillo que corre al final de cada corrida: la rutina ya sabe que
 * noticias le tocan y como analizarlas. El conteo de pendientes se calcula solo
 * para el mensaje de la interfaz.
 */
export async function analyzeAllNews(): Promise<AnalyzeAllResult> {
  try {
    const { count, error } = await supabaseAdmin()
      .from("raw_news")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_analysis")

    if (error) throw new Error(error.message)
    const pending = count ?? 0

    const result = await fireAnalysisRoutine(
      `Disparo manual desde el dashboard: hay ${pending} noticias pendientes de analisis. ` +
        `Analizalas siguiendo las instrucciones de la rutina.`
    )

    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? `La rutina respondio ${result.status}.`,
      }
    }

    // El analisis ocurre fuera de esta app y tarda; el revalidate solo refresca
    // lo que ya hubiera cambiado, no espera a que la rutina termine.
    revalidatePath("/noticias")
    return { ok: true, pending }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudo disparar la rutina." }
  }
}
