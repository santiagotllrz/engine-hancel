import { fireRoutine, routineConfig, type RoutineSlot } from "./routine-webhook"
import type { RoutineCallResult } from "./routines"

/**
 * Disparo de la rutina de analisis de Claude Code.
 *
 * La mecanica vive en `routine-webhook.ts`, compartida con las rutinas de la
 * etapa 2; aqui solo queda que par de variables de entorno la definen.
 */

export const ANALYSIS_ROUTINE_NAME = "Rutina de analisis"

const ANALYSIS_SLOT: RoutineSlot = {
  name: ANALYSIS_ROUTINE_NAME,
  urlVar: "ANALYSIS_ROUTINE_URL",
  tokenVar: "ANALYSIS_ROUTINE_TOKEN",
}

/** `null` si falta configuracion, que es lo que distingue "no montada" de "fallo". */
export function analysisRoutineConfig(): { url: string; token: string } | null {
  return routineConfig(ANALYSIS_SLOT)
}

/** No lanza nunca: el fallo viaja en el resultado. */
export async function fireAnalysisRoutine(
  input: string,
  signal?: AbortSignal
): Promise<RoutineCallResult> {
  return fireRoutine(ANALYSIS_SLOT, input, signal)
}

/** Mas alla de esto, una noticia pendiente ya no merece analisis. */
export const HORAS_DE_VIGENCIA = 36

/**
 * Saca de la cola las pendientes que ya caducaron.
 *
 * La rutina analiza por orden de llegada y en tandas cortas. Si un dia falla —el
 * token caduco dos dias seguidos— la cola se llena de noticias viejas y las
 * nuevas, que son las que valen, se quedan detras esperando a que se procese
 * prensa que ya no es prensa. Marcarlas 'expired' las quita del medio sin
 * borrarlas: siguen ahi para revisarlas, pero no se analizan.
 */
export async function expirarPendientesViejas(accountId: string): Promise<number> {
  const { supabaseAdmin } = await import("./supabase-admin")
  const limite = new Date(Date.now() - HORAS_DE_VIGENCIA * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .update({ status: "expired" })
    .eq("account_id", accountId)
    .eq("status", "pending_analysis")
    .lt("created_at", limite)
    .select("id")

  if (error) throw new Error(`No se pudieron caducar las pendientes: ${error.message}`)
  return data?.length ?? 0
}

/** Entre un disparo y el siguiente cuando queda cola: cada uno abre una sesion. */
const MINUTOS_ENTRE_DISPAROS = 60

/**
 * Vuelve a disparar la rutina si hay pendientes y lleva un rato sin correr.
 *
 * La rutina se dispara al final de cada ingesta, tres veces al dia. Como
 * analiza en tandas cortas, con eso no da para vaciar una cola de cientos: se
 * necesita que alguien insista. Lo hace el tick, que ya pasa cada cinco
 * minutos, con una hora de margen entre disparos para no abrir sesiones
 * encima de una que todavia esta trabajando sobre las mismas filas.
 *
 * El ultimo disparo se lee de `pipeline_events`, que ya lo registra: no hace
 * falta otra columna para acordarse.
 */
export async function reanudarAnalisisSiHaceFalta(
  signal?: AbortSignal
): Promise<RoutineCallResult | null> {
  const { supabaseAdmin } = await import("./supabase-admin")
  const supabase = supabaseAdmin()

  const { count } = await supabase
    .from("raw_news")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_analysis")
  if (!count) return null

  const { data: ultimo } = await supabase
    .from("pipeline_events")
    .select("at")
    .eq("kind", "routine.called")
    .eq("label", "Rutina de analisis disparada")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const hace = ultimo ? Date.now() - new Date((ultimo as { at: string }).at).getTime() : Infinity
  if (hace < MINUTOS_ENTRE_DISPAROS * 60 * 1000) return null

  const resultado = await fireAnalysisRoutine(
    `Quedan ${count} noticias pendientes de analisis. Analizalas siguiendo las ` +
      `instrucciones de la rutina, puntuando cada una segun su propio nicho.`,
    signal
  )

  // Se anota igual que desde la ingesta, para que el siguiente tick sepa
  // cuando fue y la interfaz lo enseñe en el mismo sitio.
  await supabase.from("pipeline_events").insert({
    run_id: null,
    at: new Date().toISOString(),
    kind: resultado.ok ? "routine.called" : "routine.failed",
    label: resultado.ok ? "Rutina de analisis disparada" : "La rutina de analisis fallo",
    detail: resultado.ok ? { count, status: resultado.status, desde: "tick" } : { error: resultado.error },
  })

  return resultado
}
