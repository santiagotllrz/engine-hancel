import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { modelosClaude } from "../claude/modelos"
import { supabaseAdmin } from "../supabase-admin"

/**
 * El analisis: investiga la noticia con busqueda web y la puntua.
 *
 * Era la rutina mas pesada. Ahora es una llamada directa con la busqueda web del
 * lado servidor: Claude investiga el hecho en varias fuentes, consolida el
 * contenido y lo puntua, todo en una sola llamada. El motor lee las pendientes y
 * escribe el resultado en `raw_news`; Claude no toca Supabase.
 *
 * El fit de nicho se juzga contra el nicho propio de cada noticia —que viaja en
 * el prompt—, no contra un dominio fijo: asi Agro se puntua como Agro y Hancel
 * como Hancel, con la misma vara.
 */

const ANALISIS_SYSTEM = `Eres un analista editorial de un motor de investigacion de contenido. Enriqueces y calificas una noticia.

PASO 1: INVESTIGAR
Usa la busqueda web para investigar el hecho que describe el titulo y el snippet. Prioriza fuentes primarias (la empresa, el paper, el comunicado oficial) sobre medios que reportan sobre otros. Contrasta al menos 2 fuentes cuando sea posible. No inventes datos. Maximo 3-4 busquedas.

PASO 2: CONSOLIDAR
Escribe un texto limpio y estructurado con toda la informacion factual recolectada. Solo hechos con su contexto, sin opiniones ni relleno, sin etiquetas de cita. Maximo 8000 caracteres.

PASO 3: CALIFICAR (1-10, promedio ponderado)
1. MATERIALIDAD (30%): el hecho cambia algo concreto (capacidad, posicion competitiva, regulacion, capital, personas). Alto si altera a 2+ actores.
2. NOVEDAD/TIMING (20%): ocurrio en las ultimas 72h o es la primera vez que se hace publico. Tema saturado puntua bajo.
3. POTENCIAL DE ANGULO (20%): hay un angulo que los medios generalistas ignoran, una tesis no obvia.
4. CONECTIVIDAD (15%): se conecta con otros hechos recientes formando patron, convergencia o contradiccion.
5. FIT DE NICHO (15%): es genuinamente sobre el nicho que se indica abajo. Fuera de nicho puntua 1-2.

FILTRO DURO: si NO es un hecho verificable (opinion, prediccion sin gatillo, listicle generico), relevance_score = 1-2 sin importar lo demas.

RESPONDE SOLO con este JSON, sin texto alrededor, sin saltos de linea y sin comillas dobles dentro de ninguna cadena (usa comillas simples y separa ideas con espacios dentro de full_content):
{"full_content":"<el texto consolidado del paso 2, sin etiquetas de cita, en un solo bloque sin saltos de linea>","content_fetch_status":"success|partial|failed","relevance_score":<entero 1-10>,"keywords_matched":["<4 a 6 keywords en minuscula>"],"analysis_notes":"<2-3 frases: primero el score global y por que; luego el angulo editorial mas prometedor si lo hay>"}`

type ResultadoAnalisis = {
  full_content: string | null
  content_fetch_status: string
  relevance_score: number
  keywords_matched: string[]
  analysis_notes: string
}

function normaliza(bruto: unknown): ResultadoAnalisis {
  const o = (bruto ?? {}) as Record<string, unknown>
  const score = Number(o.relevance_score)
  return {
    full_content: typeof o.full_content === "string" && o.full_content.trim() ? o.full_content.trim().slice(0, 8000) : null,
    content_fetch_status: ["success", "partial", "failed"].includes(String(o.content_fetch_status))
      ? String(o.content_fetch_status)
      : "partial",
    relevance_score: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : 1,
    keywords_matched: Array.isArray(o.keywords_matched)
      ? o.keywords_matched.filter((k): k is string => typeof k === "string").slice(0, 8)
      : [],
    analysis_notes: typeof o.analysis_notes === "string" ? o.analysis_notes.trim() : "",
  }
}

type Pendiente = {
  id: string
  title: string
  snippet: string | null
  source: string | null
  niche: string
  tema: string
}

/**
 * Analiza hasta `limite` noticias pendientes de una cuenta.
 *
 * En tandas pequenas y en paralelo moderado: cada llamada trae busquedas web
 * (mas lenta), y el tick pasa cada cinco minutos, asi que no hace falta vaciar
 * todo de una. Una noticia que falla se queda pendiente y se reintenta; la
 * caducidad de 36h saca las que se atasquen de verdad.
 */
export async function analizarPendientes(
  accountId: string,
  limite = 6
): Promise<{ analizadas: number; fallidas: number; errores: string[] }> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from("raw_news")
    .select("id, title, snippet, source, niche, tema")
    .eq("account_id", accountId)
    .eq("status", "pending_analysis")
    .order("created_at", { ascending: true })
    .limit(limite)

  if (error) throw new Error(`No se pudieron leer las pendientes: ${error.message}`)
  const pendientes = (data ?? []) as Pendiente[]
  if (pendientes.length === 0) return { analizadas: 0, fallidas: 0, errores: [] }

  const model = (await modelosClaude()).analisis
  let analizadas = 0
  let fallidas = 0
  const errores: string[] = []

  // Concurrencia moderada: 3 a la vez recorta el tiempo de pared sin pasarse de
  // los limites del plan.
  const TANDA = 3
  for (let i = 0; i < pendientes.length; i += TANDA) {
    const grupo = pendientes.slice(i, i + TANDA)
    await Promise.all(
      grupo.map(async (noticia) => {
        try {
          const prompt = `NOTICIA A INVESTIGAR Y CALIFICAR
- titulo: ${noticia.title}
- fuente: ${noticia.source ?? "desconocida"}
- nicho al que pertenece (para el FIT): ${noticia.niche} / ${noticia.tema}
- snippet: ${noticia.snippet ?? "(sin snippet)"}`

          const r = await llamarClaude({
            model,
            system: ANALISIS_SYSTEM,
            prompt,
            maxTokens: 4000,
            buscarWeb: true,
            maxBusquedas: 4,
          })
          if (!r.ok) throw new Error(r.error)

          const res = normaliza(parsearJSONDeClaude(r.texto))
          const { error: errUpdate } = await supabase
            .from("raw_news")
            .update({
              full_content: res.full_content,
              content_fetched_at: new Date().toISOString(),
              content_fetch_status: res.content_fetch_status,
              relevance_score: res.relevance_score,
              keywords_matched: res.keywords_matched,
              analysis_notes: res.analysis_notes,
              status: "analyzed",
              analyzed_at: new Date().toISOString(),
            })
            .eq("id", noticia.id)
            .eq("status", "pending_analysis")

          if (errUpdate) throw new Error(errUpdate.message)
          analizadas++
        } catch (e) {
          fallidas++
          errores.push(`[${noticia.id.slice(0, 8)}] ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    )
  }

  return { analizadas, fallidas, errores }
}
