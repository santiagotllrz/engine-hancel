import type { ModelosPorPaso, PasoIA } from "@/lib/modelos-ia"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"
import { supabaseAdmin } from "../supabase-admin"

/**
 * Que modelo usa cada paso de IA.
 *
 * Global, no por cuenta: es una sola cuenta de Claude. Se elige desde la
 * interfaz. Cada agente puede sobreescribirlo desde su ficha.
 * Las constantes (lista y pasos) viven en `@/lib/modelos-ia`, sin service role,
 * para que el selector de cliente las pueda importar.
 */

export type { ModelosPorPaso, PasoIA }

const COLUMNAS: Record<PasoIA, string> = {
  analisis: "model_analisis",
  angulo: "model_angulo",
  linkedin: "model_linkedin",
  instagram: "model_instagram",
}

const DEFAULTS: ModelosPorPaso = {
  analisis: "claude-haiku-4-5-20251001",
  angulo: "claude-sonnet-5",
  linkedin: "claude-sonnet-5",
  instagram: "claude-sonnet-5",
}

export async function modelosClaude(): Promise<ModelosPorPaso> {
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("model_analisis, model_angulo, model_linkedin, model_instagram")
    .eq("id", true)
    .maybeSingle()

  const fila = (data ?? {}) as Partial<Record<string, string>>

  // Filas viejas pueden traer el prefijo `claude/` o `gemini/` del router de
  // proveedores que hubo un tiempo. Se recorta: la API quiere el id pelado.
  const limpio = (val: string | undefined, def: string) => {
    const v = (val || def).trim()
    const sinPrefijo = v.includes("/") ? v.slice(v.indexOf("/") + 1) : v
    return sinPrefijo.startsWith("claude-") ? sinPrefijo : def
  }

  return {
    analisis: limpio(fila.model_analisis, DEFAULTS.analisis),
    angulo: limpio(fila.model_angulo, DEFAULTS.angulo),
    linkedin: limpio(fila.model_linkedin, DEFAULTS.linkedin),
    instagram: limpio(fila.model_instagram, DEFAULTS.instagram),
  }
}

/** Escribe el modelo de un paso. La red/paso y el modelo se validan. */
export async function guardarModelo(paso: PasoIA, modelo: string): Promise<void> {
  const columna = COLUMNAS[paso]
  if (!columna) throw new Error("Paso desconocido.")
  if (!MODELOS_DISPONIBLES.some((m) => m.id === modelo)) throw new Error("Modelo no permitido.")

  const { error } = await supabaseAdmin()
    .from("engine_secrets")
    .update({ [columna]: modelo, updated_at: new Date().toISOString() })
    .eq("id", true)

  if (error) throw new Error(`No se pudo guardar el modelo: ${error.message}`)
}
