import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"

/**
 * El agente de ideas: convierte las capas de un pilar en cartuchos.
 *
 * Una idea nace de una combinacion: un tema (o subtema, si el tema tiene) por
 * una intencion por una narrativa que esa intencion desbloquea. El agente
 * recorre TODAS las combinaciones de un pilar y escribe una idea distinta para
 * cada una. Eso es una ronda.
 *
 * La regla que manda sobre todo es la diversidad: dos combinaciones pueden
 * compartir tema, subtema o intencion, pero la idea concreta de cada una tiene
 * que ser de un asunto diferente. Nada de "la roya del cafe" para una intencion
 * y "la roya del cafe" para otra. Por eso la ronda se genera viendo todas las
 * combinaciones a la vez: el modelo reparte asuntos distintos entre ellas.
 */

export const IDEAS_SYSTEM = `Eres un editor que propone ideas de contenido para redes sociales de una marca del sector agropecuario colombiano.

Recibes una lista de COMBINACIONES. Cada una es un tema (a veces enfocado a un subtema concreto), una intencion (el proposito) y una narrativa (la forma de contarlo). Por cada combinacion escribes UNA idea de contenido.

LA REGLA QUE MANDA: TODAS LAS IDEAS DE LA RONDA SON DE ASUNTOS DISTINTOS.
Dos combinaciones pueden compartir el mismo tema, subtema o intencion. Sus ideas NO pueden ser del mismo asunto. Prohibido "la roya del cafe" en dos ideas, aunque una sea para Informar y otra para Advertir, o con narrativas distintas. Cada idea abre una puerta nueva: otra plaga, otra practica, otra cifra, otro momento del cultivo, otra decision del productor.

CADA IDEA:
- Es concreta y accionable, no un tema vago. "Como leer un analisis de suelo" esta bien; "hablar de suelos" no.
- Respeta su intencion y su narrativa: si la intencion es Advertir y la narrativa El error, la idea es un error comun que cuesta caro.
- Si la combinacion trae un subtema, la idea es de ese subtema: "Suelo/Abono enfocado a cafe" da una idea de suelos DE CAFE, no de suelos en general.
- No inventa datos falsos. Propone el asunto; el contenido se documenta despues.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"ideas":[{"n":<numero de la combinacion>,"idea":"<titulo concreto de la idea, una frase>","notes":"<1-2 frases de por donde va>"}]}

Devuelve exactamente una idea por combinacion, con su numero. Antes de responder, relee y confirma que no hay dos ideas del mismo asunto.`

type Comb = {
  n: number
  topicId: string
  subtopicId: string | null
  intentId: string
  narrativeId: string
  linea: string
}

type FilaCapa = { id: string; name: string; description: string | null }

/**
 * Todas las combinaciones de un pilar.
 *
 * Por cada tema: si tiene subtemas, una entrada por subtema; si no, una del
 * tema entero. Cada una por cada intencion y por cada narrativa que esa
 * intencion desbloqueo. Si falta cualquier pieza (sin intenciones, sin
 * narrativas enlazadas) no hay combinaciones, y no es un fallo: es un pilar a
 * medio configurar.
 */
async function combinacionesDe(accountId: string, pillarId: string): Promise<Comb[]> {
  const supabase = supabaseAdmin()

  const [temas, subtemas, intenciones, narrativas, enlaces] = await Promise.all([
    supabase.from("content_topics").select("id, name, description").eq("pillar_id", pillarId),
    supabase.from("content_subtopics").select("id, name, topic_id").eq("account_id", accountId),
    supabase.from("content_intents").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_intent_narratives").select("intent_id, narrative_id").eq("account_id", accountId),
  ])

  const losTemas = (temas.data ?? []) as FilaCapa[]
  const losIntentos = (intenciones.data ?? []) as FilaCapa[]
  const narrPorId = new Map((narrativas.data ?? []).map((n) => [(n as FilaCapa).id, n as FilaCapa]))
  const subPorTema = new Map<string, FilaCapa[]>()
  for (const s of (subtemas.data ?? []) as (FilaCapa & { topic_id: string })[]) {
    const lista = subPorTema.get(s.topic_id) ?? []
    lista.push(s)
    subPorTema.set(s.topic_id, lista)
  }
  const narrsDeIntento = new Map<string, string[]>()
  for (const e of (enlaces.data ?? []) as { intent_id: string; narrative_id: string }[]) {
    const lista = narrsDeIntento.get(e.intent_id) ?? []
    lista.push(e.narrative_id)
    narrsDeIntento.set(e.intent_id, lista)
  }

  const combs: Comb[] = []
  let n = 0
  for (const tema of losTemas) {
    // El tema entero, o cada subtema si los hay.
    const focos = subPorTema.get(tema.id) ?? [null]
    for (const sub of focos) {
      for (const intento of losIntentos) {
        for (const narrId of narrsDeIntento.get(intento.id) ?? []) {
          const narr = narrPorId.get(narrId)
          if (!narr) continue
          n++
          const foco = sub ? `${tema.name} enfocado a ${sub.name}` : tema.name
          combs.push({
            n,
            topicId: tema.id,
            subtopicId: sub?.id ?? null,
            intentId: intento.id,
            narrativeId: narrId,
            linea:
              `[${n}] Tema: ${foco}` +
              (tema.description ? ` (${tema.description})` : "") +
              ` | Intencion: ${intento.name}` +
              (intento.description ? ` (${intento.description})` : "") +
              ` | Narrativa: ${narr.name}` +
              (narr.description ? ` (${narr.description})` : ""),
          })
        }
      }
    }
  }

  return combs
}

export type ResultadoIdeas = {
  pillarId: string
  generadas: number
  ronda: number
  uso: UsoClaude
  error?: string
}

/** Cuantas combinaciones se mandan en una misma llamada. */
const LOTE = 25

/**
 * Genera una ronda de cartuchos para un pilar.
 *
 * Si hay muchas combinaciones se lotea, y a cada lote se le pasan los titulos
 * ya generados para que no repita asunto entre lotes: la diversidad tiene que
 * valer para la ronda entera, no solo dentro de una llamada.
 */
export async function generarRonda(
  accountId: string,
  pillarId: string,
  model: string
): Promise<ResultadoIdeas> {
  const supabase = supabaseAdmin()
  const combs = await combinacionesDe(accountId, pillarId)

  const uso: UsoClaude = { entrada: 0, salida: 0 }
  if (combs.length === 0) {
    return { pillarId, generadas: 0, ronda: 0, uso, error: "El pilar no tiene combinaciones: le faltan temas, intenciones o narrativas enlazadas." }
  }

  // La ronda es la siguiente a la ultima que haya de este pilar.
  const { data: ultima } = await supabase
    .from("content_cartridges")
    .select("round")
    .eq("pillar_id", pillarId)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle()
  const ronda = ((ultima as { round: number } | null)?.round ?? 0) + 1

  const porNumero = new Map(combs.map((c) => [c.n, c]))
  const yaGeneradas: string[] = []
  const aInsertar: Record<string, unknown>[] = []

  for (let i = 0; i < combs.length; i += LOTE) {
    const lote = combs.slice(i, i + LOTE)
    const evita =
      yaGeneradas.length > 0
        ? `\n\nYA PROPUSISTE ESTOS ASUNTOS EN ESTA RONDA, NO LOS REPITAS NI PAREZCAS:\n${yaGeneradas.map((t) => `- ${t}`).join("\n")}`
        : ""

    const prompt = `COMBINACIONES\n${lote.map((c) => c.linea).join("\n")}${evita}`
    const r = await llamarClaude({ model, system: IDEAS_SYSTEM, prompt, maxTokens: 3000 })
    if (!r.ok) return { pillarId, generadas: aInsertar.length, ronda, uso, error: r.error }

    uso.entrada += r.uso.entrada
    uso.salida += r.uso.salida

    const bruto = parsearJSONDeClaude(r.texto) as { ideas?: unknown }
    const ideas = Array.isArray(bruto.ideas) ? bruto.ideas : []
    for (const it of ideas as { n?: unknown; idea?: unknown; notes?: unknown }[]) {
      const comb = typeof it.n === "number" ? porNumero.get(it.n) : undefined
      const idea = typeof it.idea === "string" ? it.idea.trim() : ""
      if (!comb || !idea) continue
      yaGeneradas.push(idea)
      aInsertar.push({
        account_id: accountId,
        pillar_id: pillarId,
        topic_id: comb.topicId,
        subtopic_id: comb.subtopicId,
        intent_id: comb.intentId,
        narrative_id: comb.narrativeId,
        idea: idea.slice(0, 500),
        notes: typeof it.notes === "string" ? it.notes.trim().slice(0, 500) : null,
        round: ronda,
      })
    }
  }

  if (aInsertar.length > 0) {
    const { error } = await supabase.from("content_cartridges").insert(aInsertar)
    if (error) return { pillarId, generadas: 0, ronda, uso, error: error.message }
  }

  return { pillarId, generadas: aInsertar.length, ronda, uso }
}
