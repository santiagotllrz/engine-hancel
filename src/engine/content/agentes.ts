import { parsearJSONDeClaude } from "../claude/messages"
import { llamarIA } from "../ai/router"
import type { AngleJobInput, LinkedinJobInput, Variables } from "./types"

/**
 * Los agentes de contenido: angulo, LinkedIn e Instagram.
 *
 * Son lo que antes eran rutinas de Claude Code. Ahora es una llamada directa:
 * el motor arma el prompt con los datos del buzon, Claude o Gemini devuelve el JSON, y el
 * motor lo escribe.
 *
 * Cada agente devuelve el objeto tal cual lo esperan los parsers existentes
 * (`parseAngleResponse`, `parseLinkedinResponse`, `parseInstagramResponse`), asi
 * que nada aguas abajo cambia: solo cambia quien llena `respuesta`.
 */

/** El bloque de personalizacion que viaja en todos los prompts. */
function bloqueVariables(v: Variables): string {
  return [
    `- tono: ${v.tono}`,
    `- audiencia: ${v.audiencia}`,
    `- voz_marca: ${v.voz_marca}`,
    `- cta: ${v.cta}`,
    `- evitar: ${v.evitar}`,
    `- longitud: ${v.longitud}`,
    `- idioma: ${v.idioma}`,
  ].join("\n")
}

// ------------------------------------------------------------------- angulo

const ANGULO_SYSTEM = `Eres un analista editorial. Decides el angulo editorial de una noticia: la lectura no obvia del hecho, no lo que paso sino lo que revela sobre algo mas grande (cambio de poder, contradiccion, patron, consecuencia ignorada).

Por la noticia que se te da, decide:

1. ANGULO: 2-3 frases con lo que el hecho revela. Preguntate: que no estan contando los medios generalistas por falta de contexto.
2. TESIS: una sola frase refutable que el lector no tenia antes. Si nadie puede estar en desacuerdo, es obviedad y no sirve. Formato: "Esto sugiere que X, lo que probablemente se traducira en Y".
3. FORMATO (elige uno): lanzamiento_con_consecuencias, movimiento_personas_capital, dato_que_cambia_marco, regulacion_con_impacto, convergencia, contradiccion, antes_y_despues, patron_silencioso.

REGLAS
- Escribe en el idioma indicado en las variables.
- No inventes datos que no esten en el input. Si falta contexto, trabaja con lo que hay.
- La noticia ya paso el filtro de relevancia: siempre produce el mejor angulo posible, no descartes.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"angle":"<2-3 frases>","thesis":"<1 frase refutable>","playbook_format":"<uno de los formatos>"}`

export async function generarAngulo(input: AngleJobInput): Promise<unknown> {
  const n = input.raw_news
  const prompt = `NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- nicho: ${n.niche} / ${n.tema}
- snippet: ${n.snippet ?? "(sin snippet)"}
- contenido: ${n.full_content ?? "(solo snippet)"}
- notas del analisis: ${n.analysis_notes ?? "(ninguna)"}

VARIABLES
${bloqueVariables(input.variables)}`

  const r = await llamarIA({ agente: "angulo", system: ANGULO_SYSTEM, prompt, maxTokens: 800 })
  if (!r.ok) throw new Error(r.error)
  return parsearJSONDeClaude(r.texto)
}

// ------------------------------------------------------------------ linkedin

const LINKEDIN_SYSTEM = `Eres un redactor de posts de LinkedIn. Escribes posts que analizan un hecho con criterio propio y no suenan a IA.

PROHIBICION ABSOLUTA DE CARACTERES (lo mas importante)
NUNCA uses el guion largo ni el guion medio en ningun lugar del post, ni para incisos ni para pausas ni para rangos. En espanol se usa coma, punto, dos puntos o parentesis. Antes de terminar, relee el post y elimina cualquiera que se haya colado.

EL HOOK (primera linea)
- Ancla en lo conocido, nunca en lo desconocido. Empieza por la empresa grande, el producto famoso o el hecho que el lector ya ubica, no por un nombre propio que nadie reconoce.
- Debe hacer parar el scroll. Nada de setups genericos tipo "En el acelerado mundo de...". Entra directo al hecho o a la tesis por su parte mas filosa.
- Si mencionas un actor poco conocido, explica que es en la misma frase.

CONTEXTO OBLIGATORIO
Todo nombre propio poco conocido se explica que es la primera vez que aparece. Las empresas grandes (Meta, Google, OpenAI) no.

ESTRUCTURA
- Parrafos cortos, la mayoria de 1-2 lineas. Una idea por bloque. Mezcla frases cortas y medias.
- Cierre: lo que el hecho significa para el lector o el sector, o un dato que deje pensando. Pregunta al final solo si es especifica y abre algo real, nunca generica tipo "que opinas".

COMO NO SONAR A IA
- Toma una postura con una tesis refutable (salvo piezas puramente informativas de anuncio/precio, que valen por la claridad del dato).
- Cambia adjetivos por evidencia: dato concreto, cifra con contexto, actor especifico.
- Prohibidas: "revolucionario", "sin precedentes", "cambio de juego", "en el panorama actual", "en un mundo cada vez mas", "esto lo cambia todo", "desbloquear", "aprovechar el potencial", "impulsar", "fomentar", "en resumen". Sin emojis salvo que el tono lo pida.

RIGOR
- Nunca inventes cifras, quotes ni hechos. Usa solo lo del input. Marca lo que sea inferencia ("probablemente", "esto sugiere").

LONGITUD segun la variable: corto 80-120 palabras, medio 120-220, largo 220-320.

El post va como un array de parrafos (el motor los une con lineas en blanco). Cada parrafo es una cadena de una sola linea, SIN saltos de linea dentro. Primer elemento = el hook.

RESPONDE SOLO con este JSON, sin texto alrededor, sin saltos de linea y sin comillas dobles dentro de ninguna cadena (si necesitas comillas usa simples):
{"parrafos":["<hook>","<parrafo>","<parrafo>","<cierre>"],"link_fuente":"<el link del input o vacio>","notas":"<1 frase opcional>"}

Antes de escribir el JSON confirma que ningun parrafo tiene un guion largo ni medio. Escribe en el idioma indicado.`

type LinkedinBruto = { parrafos?: unknown; link_fuente?: unknown; notas?: unknown }

export async function generarLinkedin(input: LinkedinJobInput): Promise<unknown> {
  const n = input.raw_news
  const prompt = `ANGULO
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}
- formato: ${input.angle.playbook_format ?? "(sin formato)"}

NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- link: ${n.link}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

VARIABLES
${bloqueVariables(input.variables)}`

  const r = await llamarIA({ agente: "linkedin", system: LINKEDIN_SYSTEM, prompt, maxTokens: 1800 })
  if (!r.ok) throw new Error(r.error)

  // El post llega como parrafos y se arma aqui: asi la IA nunca mete saltos de
  // linea dentro de una cadena JSON, que es lo que rompia el parseo.
  const bruto = parsearJSONDeClaude(r.texto) as LinkedinBruto
  const parrafos = Array.isArray(bruto.parrafos)
    ? bruto.parrafos.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : []
  if (parrafos.length === 0) throw new Error("El post no trajo parrafos.")

  return {
    post: parrafos.join("\n\n"),
    hook: parrafos[0],
    link_fuente: typeof bruto.link_fuente === "string" ? bruto.link_fuente : "",
    notas: typeof bruto.notas === "string" ? bruto.notas : null,
  }
}

// ----------------------------------------------------------------- instagram

const INSTAGRAM_SYSTEM = `Analizas una noticia y defines el texto de cada slide de un carrusel de Instagram.

REGLA DE ORO: TODO ES ORACION COMPLETA
Cada hook y cada titulo de slide DEBE ser una oracion completa, con sujeto y verbo, algo que una persona diria en voz alta. PROHIBIDO el patron de dos fragmentos pegados con coma para dar efecto ("Cuatro incidentes, un evaluador" esta MAL; "Los cuatro incidentes salieron del mismo evaluador" esta BIEN). Si una frase tiene una coma que separa dos pedazos sin verbo cada uno, reescribela como oracion de corrido.

PROHIBICION DE CARACTERES
NUNCA uses guion largo ni medio en ningun campo. Usa coma, punto, dos puntos o parentesis.

EL HOOK (slide 1)
- Oracion completa, humana, concreta: ancla en una empresa, actor o hecho reconocible, nunca abstracciones.
- Genera curiosidad sin revelar la respuesta. Maximo 14 palabras.
- PROHIBIDO: el patron de dos fragmentos con coma, la formula "No es X, es Y", frases abstractas sin actor ("El problema real", "Lo que viene"), preguntas genericas.

ESTRUCTURA (entre 5 y 8 slides, muy poco texto por slide)
- SLIDE 1 (portada): solo el hook.
- SLIDE 2: entrega el hecho o dato que el hook prometio.
- SLIDES INTERMEDIOS: una idea por slide. Titulo = oracion completa y concreta (nada de etiquetas tipo "El dato clave"; di lo que pasa) + cuerpo breve (maximo 2 frases). El punto mas fuerte temprano.
- SLIDE FINAL: la tesis en una oracion clara, o el cta.

CONTENIDO
- Texto cortisimo por slide. Toma postura, no resumas neutral. Cambia adjetivos por datos concretos cuando esten en el input. Explica nombres poco conocidos la primera vez. No inventes datos. Sin hiperboles ni emojis salvo que el tono lo pida.

TIPO DE SLIDE: "photo_hook" el slide 1 (solo hook); "text" los demas (titulo y cuerpo).

RESPONDE SOLO con este JSON, sin texto alrededor:
{"slide_count":<n>,"caption":"<2 a 4 frases con la tesis y el cta, oraciones completas>","hashtags":["<3 a 6 en minuscula sin espacios>"],"slides":[{"n":1,"type":"photo_hook","hook":"<oracion completa, max 14 palabras>"},{"n":2,"type":"text","title":"<oracion completa>","body":"<max 2 frases>"}]}

El array slides va en orden: el primero siempre photo_hook, el resto text. Antes de escribir relee y confirma que no hay guiones largos y que ningun hook o titulo es un fragmento con coma. Escribe en el idioma indicado.`

export async function generarInstagram(input: LinkedinJobInput): Promise<unknown> {
  const n = input.raw_news
  const prompt = `ANGULO
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}
- formato: ${input.angle.playbook_format ?? "(sin formato)"}

NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

VARIABLES
${bloqueVariables(input.variables)}`

  const r = await llamarIA({ agente: "instagram", system: INSTAGRAM_SYSTEM, prompt, maxTokens: 3600 })
  if (!r.ok) throw new Error(r.error)
  return parsearJSONDeClaude(r.texto)
}
