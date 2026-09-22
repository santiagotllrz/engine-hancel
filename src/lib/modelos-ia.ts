/**
 * Constantes de los modelos de IA, sin dependencias de servidor.
 *
 * Viven aparte para que las pueda importar tanto el motor (que lee/escribe en
 * Supabase) como el componente de cliente del selector, sin arrastrar la
 * service role al bundle del navegador.
 */

export type PasoIA = "analisis" | "angulo" | "linkedin" | "instagram"

export const PASOS_IA: { paso: PasoIA; nombre: string }[] = [
  { paso: "analisis", nombre: "Analisis" },
  { paso: "angulo", nombre: "Angulo" },
  { paso: "linkedin", nombre: "LinkedIn" },
  { paso: "instagram", nombre: "Instagram" },
]

export const MODELOS_DISPONIBLES: { id: string; nombre: string; provider?: "claude" | "gemini" }[] = [
  // Claude models
  { id: "claude/claude-haiku-4-5-20251001", nombre: "Claude Haiku 4.5", provider: "claude" },
  { id: "claude/claude-sonnet-5", nombre: "Claude Sonnet 5", provider: "claude" },
  { id: "claude/claude-opus-5", nombre: "Claude Opus 5", provider: "claude" },
  
  // Gemini models
  { id: "gemini/gemini-1.5-flash", nombre: "Gemini 1.5 Flash (rápido, gratis)", provider: "gemini" },
  { id: "gemini/gemini-1.5-pro", nombre: "Gemini 1.5 Pro (alta capacidad)", provider: "gemini" },
]

export type ModelosPorPaso = Record<PasoIA, string>
