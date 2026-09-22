import { llamarClaude } from "../claude/messages"
import { llamarGemini } from "../gemini/messages"
import { supabaseAdmin } from "../supabase-admin"

export type AgenteType = "analisis" | "angulo" | "linkedin" | "instagram"
export type AIProvider = "claude" | "gemini"

export type LlamadaIA = {
  agente: AgenteType
  system: string
  prompt: string
  maxTokens: number
  buscarWeb?: boolean
  maxBusquedas?: number
}

export type ResultadoIA =
  | { ok: true; texto: string; provider: AIProvider; model: string }
  | { ok: false; error: string; provider?: AIProvider }

/** 
 * Configuración por defecto si no hay nada en DB.
 */
const DEFAULT_AI_CONFIG: Record<AgenteType, { provider: AIProvider, model: string }> = {
  analisis: { provider: "claude", model: "claude-3-5-haiku-latest" },
  angulo: { provider: "claude", model: "claude-3-5-sonnet-latest" },
  linkedin: { provider: "claude", model: "claude-3-5-sonnet-latest" },
  instagram: { provider: "claude", model: "claude-3-5-sonnet-latest" }
}

async function getAIConfig(agente: AgenteType): Promise<{ provider: AIProvider, model: string }> {
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select(`model_${agente}`)
    .eq("id", true)
    .maybeSingle()
  
  const rawModel = data ? data[`model_${agente}` as keyof typeof data] as string : null;
  if (rawModel) {
    if (rawModel.startsWith("gemini/")) {
      return { provider: "gemini", model: rawModel.replace("gemini/", "") }
    } else if (rawModel.startsWith("claude/")) {
      return { provider: "claude", model: rawModel.replace("claude/", "") }
    }
    // Fallback: si no tiene prefijo, asumimos que es Claude (como estaba antes)
    return { provider: "claude", model: rawModel }
  }

  return DEFAULT_AI_CONFIG[agente]
}

export async function llamarIA(opciones: LlamadaIA): Promise<ResultadoIA> {
  const { provider, model } = await getAIConfig(opciones.agente)

  try {
    if (provider === "gemini") {
      const res = await llamarGemini({
        model,
        system: opciones.system,
        prompt: opciones.prompt,
        maxTokens: opciones.maxTokens,
        buscarWeb: opciones.buscarWeb
      })
      if (!res.ok) return { ok: false, error: res.error, provider }
      return { ok: true, texto: res.texto, provider, model }
    } else {
      const res = await llamarClaude({
        model,
        system: opciones.system,
        prompt: opciones.prompt,
        maxTokens: opciones.maxTokens,
        buscarWeb: opciones.buscarWeb,
        maxBusquedas: opciones.maxBusquedas
      })
      if (!res.ok) return { ok: false, error: res.error, provider }
      return { ok: true, texto: res.texto, provider, model }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message, provider }
  }
}
