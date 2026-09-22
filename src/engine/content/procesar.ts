import { supabaseAdmin } from "../supabase-admin"
import { generarAngulo, generarInstagram, generarLinkedin } from "./agentes"
import type { AngleJobInput, LinkedinJobInput } from "./types"

/**
 * Procesa los buzones llamando a los agentes.
 *
 * Antes esto lo hacia una rutina externa: leia `pending`, escribia `respuesta`,
 * marcaba `done`. Ahora lo hace el motor, con una llamada directa a Claude. El
 * resto del tick (drenaje, parseo, materializacion) no cambia: sigue leyendo
 * `respuesta` igual que antes.
 *
 * El reclamo es un compare-and-set: `pending -> processing` por fila. Si dos
 * pasadas se solapan, solo una se queda cada trabajo; la otra lo salta.
 */

const MAX_POR_TICK = 10

type Buzon = "jobs_angle" | "jobs_linkedin" | "jobs_instagram"

async function procesarBuzon(
  tabla: Buzon,
  agente: (input: unknown) => Promise<unknown>
): Promise<{ procesadas: number; fallidas: number; errores: string[] }> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from(tabla)
    .select("id, input")
    .eq("status", "pending")
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_POR_TICK)

  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  const jobs = (data ?? []) as { id: string; input: unknown }[]

  let procesadas = 0
  let fallidas = 0
  const errores: string[] = []

  for (const job of jobs) {
    // Reclamo atomico: si otra pasada ya lo tomo, `claimed` viene vacio.
    const { data: claimed } = await supabase
      .from(tabla)
      .update({ status: "processing" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()
    if (!claimed) continue

    try {
      const respuesta = await agente(job.input)
      const { error: errDone } = await supabase
        .from(tabla)
        .update({ respuesta, status: "done", processed_at: new Date().toISOString() })
        .eq("id", job.id)
      if (errDone) throw new Error(errDone.message)
      procesadas++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase
        .from(tabla)
        .update({ status: "failed", error: msg.slice(0, 1000), processed_at: new Date().toISOString() })
        .eq("id", job.id)
      fallidas++
      errores.push(`[${tabla}] ${msg}`)
    }
  }

  return { procesadas, fallidas, errores }
}

/**
 * Devuelve a la cola los trabajos que quedaron 'processing' colgados.
 *
 * El motor procesa en segundos dentro de un tick, asi que un 'processing' de mas
 * de media hora solo puede ser un tick que se cayo a mitad. Se reclama para que
 * el siguiente lo reintente, en vez de quedar perdido para siempre.
 */
async function reclamarColgados(): Promise<void> {
  const supabase = supabaseAdmin()
  const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  for (const tabla of ["jobs_angle", "jobs_linkedin", "jobs_instagram"] as const) {
    await supabase
      .from(tabla)
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("created_at", limite)
  }
}

export async function procesarBuzones(): Promise<{
  procesadas: number
  fallidas: number
  errores: string[]
}> {
  await reclamarColgados()

  const resultados = [
    await procesarBuzon("jobs_angle", (input) =>
      generarAngulo(input as AngleJobInput)
    ),
    await procesarBuzon("jobs_linkedin", (input) =>
      generarLinkedin(input as LinkedinJobInput)
    ),
    await procesarBuzon("jobs_instagram", (input) =>
      generarInstagram(input as LinkedinJobInput)
    ),
  ]

  return {
    procesadas: resultados.reduce((n, r) => n + r.procesadas, 0),
    fallidas: resultados.reduce((n, r) => n + r.fallidas, 0),
    errores: resultados.flatMap((r) => r.errores),
  }
}
