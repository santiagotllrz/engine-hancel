import { supabaseAdmin } from "../supabase-admin"

/** Mas alla de esto, una noticia pendiente ya no merece analisis. */
export const HORAS_DE_VIGENCIA = 36

/**
 * Saca de la cola las pendientes que ya caducaron.
 *
 * El analisis va por orden de llegada y en tandas cortas. Si algo se atasca, la
 * cola se llena de noticias viejas y las nuevas, que son las que valen, esperan
 * detras de prensa que ya no es prensa. Marcarlas 'expired' las quita del medio
 * sin borrarlas: siguen ahi para revisarlas, pero no se analizan.
 */
export async function expirarPendientesViejas(accountId: string): Promise<number> {
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
