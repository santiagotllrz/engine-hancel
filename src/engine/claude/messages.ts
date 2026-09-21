import { supabaseAdmin } from "../supabase-admin"

/**
 * Llamada directa a Claude con el token de tu cuenta.
 *
 * Reemplaza a las rutinas: en vez de disparar un webhook y esperar a que una
 * sesion agentica en la nube escriba en el buzon, aqui se le pide a Claude una
 * respuesta de un tiro y se recibe en el acto. Un solo token para los cuatro
 * pasos (analisis, angulo, LinkedIn, Instagram), guardado en `engine_secrets`.
 *
 * La autenticacion es la misma que usa Claude Code: el token OAuth de la
 * suscripcion (`sk-ant-oat01`, de `claude setup-token`) viaja como `Bearer` y la
 * cabecera beta identifica la peticion como Claude Code. Verificado contra la
 * API: sin el scope de inferencia, responde 403 —por eso el token de las rutinas
 * viejas no sirve, era de otro tipo—. Tambien acepta una API key de consola
 * (`sk-ant-api03`) por la ruta estandar, por si algun dia se cambia.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const OAUTH_BETA = "oauth-2025-04-20"

/**
 * La identidad de Claude Code va como primer bloque de sistema. La API reserva
 * la ruta del token de suscripcion a su propio cliente: sin esta linea, rechaza.
 * Las instrucciones de verdad de cada paso van como segundo bloque, despues.
 */
const IDENTIDAD_CLAUDE_CODE = "You are Claude Code, Anthropic's official CLI for Claude."

/** El timeout es generoso: una generacion larga (un carrusel) puede tardar. */
const TIMEOUT_MS = 120_000

export type LlamadaClaude = {
  /** Id de modelo. Haiku para volumen barato, Sonnet/Opus para escribir. */
  model: string
  /** Las instrucciones del paso: el rol, el tono, el formato de salida. */
  system: string
  /** El contenido concreto sobre el que trabajar (la noticia, el angulo...). */
  prompt: string
  maxTokens: number
  /**
   * Activa la busqueda web del lado servidor. Anthropic corre las busquedas
   * dentro de la misma llamada y devuelve la respuesta ya con las fuentes: es lo
   * que reemplaza al research que hacia la rutina de analisis, sin agente.
   */
  buscarWeb?: boolean
  /** Tope de busquedas cuando `buscarWeb` esta activo. */
  maxBusquedas?: number
}

export type ResultadoClaude =
  | { ok: true; texto: string }
  | { ok: false; error: string }

/** Lee el token guardado. `null` si nadie lo ha pegado todavia. */
export async function tokenClaude(): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("engine_secrets")
    .select("claude_oauth_token")
    .eq("id", true)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer el token de Claude: ${error.message}`)
  const token = (data as { claude_oauth_token: string | null } | null)?.claude_oauth_token
  return token && token.trim().length > 0 ? token.trim() : null
}

/**
 * Pide una respuesta a Claude. No lanza: el fallo viaja en el resultado, igual
 * que las rutinas, para que un tropiezo no tumbe la pasada que ya hizo trabajo.
 */
export async function llamarClaude(opciones: LlamadaClaude): Promise<ResultadoClaude> {
  const token = await tokenClaude()
  if (!token) {
    return {
      ok: false,
      error:
        "No hay token de Claude configurado. Pegalo en la pantalla de configuracion " +
        "(lo generas con `claude setup-token`).",
    }
  }

  // La API key de consola va por su cabecera propia; el token de suscripcion,
  // como Bearer con la beta de OAuth.
  const esApiKey = token.startsWith("sk-ant-api")
  const headers: Record<string, string> = {
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  }
  if (esApiKey) {
    headers["x-api-key"] = token
  } else {
    headers["authorization"] = `Bearer ${token}`
    headers["anthropic-beta"] = OAUTH_BETA
  }

  // Con el token de suscripcion, el primer bloque de sistema tiene que ser la
  // identidad de Claude Code; con API key no hace falta, pero no molesta.
  const system = esApiKey
    ? opciones.system
    : [
        { type: "text", text: IDENTIDAD_CLAUDE_CODE },
        { type: "text", text: opciones.system },
      ]

  try {
    const body: Record<string, unknown> = {
      model: opciones.model,
      max_tokens: opciones.maxTokens,
      system,
      messages: [{ role: "user", content: opciones.prompt }],
    }
    if (opciones.buscarWeb) {
      body.tools = [
        { type: "web_search_20250305", name: "web_search", max_uses: opciones.maxBusquedas ?? 4 },
      ]
    }

    const response = await fetch(MESSAGES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const cuerpo = await response.text()

    if (!response.ok) {
      return { ok: false, error: mensajeDeError(response.status, cuerpo) }
    }

    const datos = JSON.parse(cuerpo) as {
      content?: { type: string; text?: string }[]
    }
    const texto = (datos.content ?? [])
      .filter((bloque) => bloque.type === "text" && bloque.text)
      .map((bloque) => bloque.text)
      .join("")
      .trim()

    if (!texto) return { ok: false, error: "Claude respondio sin texto." }
    return { ok: true, texto }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * Extrae el JSON de la respuesta de Claude.
 *
 * El modelo suele envolver el JSON en una valla ```json, y con busqueda web
 * mete etiquetas <cite index="..."> dentro del texto. Se limpian las dos cosas
 * antes de parsear. Lanza con un recorte del texto crudo si no cuadra, para que
 * quien llama guarde el motivo y no se pierda lo que dijo el modelo.
 */
export function parsearJSONDeClaude(texto: string): unknown {
  let limpio = texto.trim()

  // Quita las etiquetas de cita de la busqueda web, dejando el contenido.
  limpio = limpio.replace(/<\/?cite[^>]*>/g, "")

  // Si viene en una valla de codigo, saca lo de dentro.
  const valla = limpio.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (valla) limpio = valla[1].trim()

  // Ultimo recurso: recorta a las llaves exteriores.
  if (!limpio.startsWith("{") && !limpio.startsWith("[")) {
    const desde = limpio.search(/[[{]/)
    const hasta = Math.max(limpio.lastIndexOf("}"), limpio.lastIndexOf("]"))
    if (desde >= 0 && hasta > desde) limpio = limpio.slice(desde, hasta + 1)
  }

  try {
    return JSON.parse(limpio)
  } catch {
    // Red de seguridad: si un salto de linea se colo dentro de una cadena, el
    // parseo falla. Cambiarlos por espacios rescata la respuesta; entre tokens
    // el JSON ignora los espacios, asi que no rompe nada.
    try {
      return JSON.parse(limpio.replace(/[\n\r\t]+/g, " "))
    } catch {
      throw new Error(`La respuesta de Claude no es JSON valido. Empezaba: ${texto.slice(0, 200)}`)
    }
  }
}

/** Traduce los fallos mas comunes a algo accionable en la interfaz. */
function mensajeDeError(status: number, cuerpo: string): string {
  const recorte = cuerpo.slice(0, 300)

  if (status === 401) {
    return "El token no es valido o fue revocado. Genera uno nuevo con `claude setup-token` y pegalo de nuevo."
  }
  if (status === 403 && recorte.includes("scope")) {
    return (
      "El token no tiene permiso de inferencia. Tiene que ser el de `claude setup-token` " +
      "(suscripcion), no el de una rutina ni otro. Vuelve a generarlo con ese comando."
    )
  }
  if (status === 429) {
    return "Se agoto el limite de uso de tu plan por ahora. Reintenta mas tarde."
  }
  return `Claude respondio ${status}: ${recorte}`
}
