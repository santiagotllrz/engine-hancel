import { supabaseAdmin } from "../supabase-admin"

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/"

export type LlamadaGemini = {
  model: string
  system: string
  prompt: string
  maxTokens: number
  buscarWeb?: boolean
}

export type ResultadoGemini =
  | { ok: true; texto: string }
  | { ok: false; error: string }

export async function tokenGemini(): Promise<string | null> {
  // Primero intentamos de las variables de entorno (útil para pruebas locales)
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY

  // Luego de la base de datos
  const { data, error } = await supabaseAdmin()
    .from("engine_secrets")
    .select("gemini_api_key")
    .eq("id", true)
    .maybeSingle()

  if (error || !data) return null
  return data.gemini_api_key
}

export async function llamarGemini(opciones: LlamadaGemini): Promise<ResultadoGemini> {
  const token = await tokenGemini()
  if (!token) {
    return {
      ok: false,
      error: "No hay token de Gemini configurado. Configúralo en la interfaz o en .env.local",
    }
  }

  try {
    const url = `${GEMINI_API_URL}${opciones.model}:generateContent?key=${token}`
    
    // Convertimos el formato de claude al formato de Gemini
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: opciones.system }] },
      contents: [{ role: "user", parts: [{ text: opciones.prompt }] }],
      generationConfig: { maxOutputTokens: opciones.maxTokens }
    }

    // Activamos Google Search Grounding si se solicita
    if (opciones.buscarWeb) {
      body.tools = [{ googleSearch: {} }]
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const cuerpo = await response.text()

    if (!response.ok) {
      return { ok: false, error: `Gemini respondió ${response.status}: ${cuerpo.slice(0, 300)}` }
    }

    const datos = JSON.parse(cuerpo)
    const texto = datos.candidates?.[0]?.content?.parts?.[0]?.text

    if (!texto) return { ok: false, error: "Gemini respondió sin texto o el formato no es válido." }
    return { ok: true, texto: texto.trim() }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
