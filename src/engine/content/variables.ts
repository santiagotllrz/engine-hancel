import type { Variables } from "./types"

/**
 * Las ranuras de personalizacion y sus valores admitidos.
 *
 * La capa de variables no es texto libre que se le pasa al modelo como
 * instruccion: son selectores y campos acotados. Esa es justamente la defensa
 * contra que se rompa el criterio editorial o se inyecten instrucciones en el
 * prompt base, que vive en la rutina y no aqui.
 */

export const TONOS = ["profesional", "cercano", "provocador", "tecnico"] as const
export const LONGITUDES = ["corto", "medio", "largo"] as const
export const IDIOMAS = ["es", "en"] as const

/** Tope de los campos abiertos: acotados, no libres. */
export const MAX_TEXTO = 240

export const DEFAULT_VARIABLES: Variables = {
  tono: "profesional",
  audiencia: "",
  voz_marca: "",
  cta: "",
  evitar: "",
  longitud: "medio",
  idioma: "es",
}

function pickOne(value: unknown, permitidos: readonly string[], porDefecto: string): string {
  const texto = typeof value === "string" ? value.trim() : ""
  return permitidos.includes(texto) ? texto : porDefecto
}

function pickText(value: unknown, porDefecto: string): string {
  if (typeof value !== "string") return porDefecto
  return value.trim().slice(0, MAX_TEXTO)
}

/**
 * Normaliza lo que venga de la base o de un formulario.
 *
 * Nunca lanza: un valor desconocido cae al de por defecto en vez de tumbar una
 * generacion. Lo que valida de verdad es `validateVariables`, que se usa al
 * guardar para poder decirle al usuario que esta mal.
 */
export function parseVariables(value: unknown): Variables {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    tono: pickOne(raw.tono, TONOS, DEFAULT_VARIABLES.tono),
    audiencia: pickText(raw.audiencia, DEFAULT_VARIABLES.audiencia),
    voz_marca: pickText(raw.voz_marca, DEFAULT_VARIABLES.voz_marca),
    cta: pickText(raw.cta, DEFAULT_VARIABLES.cta),
    evitar: pickText(raw.evitar, DEFAULT_VARIABLES.evitar),
    longitud: pickOne(raw.longitud, LONGITUDES, DEFAULT_VARIABLES.longitud),
    idioma: pickOne(raw.idioma, IDIOMAS, DEFAULT_VARIABLES.idioma),
  }
}

/** Mensaje de error para el usuario, o `null` si todo vale. */
export function validateVariables(value: Record<string, unknown>): string | null {
  if (value.tono !== undefined && !TONOS.includes(String(value.tono) as never)) {
    return `El tono tiene que ser uno de: ${TONOS.join(", ")}.`
  }
  if (value.longitud !== undefined && !LONGITUDES.includes(String(value.longitud) as never)) {
    return `La longitud tiene que ser una de: ${LONGITUDES.join(", ")}.`
  }
  if (value.idioma !== undefined && !IDIOMAS.includes(String(value.idioma) as never)) {
    return `El idioma tiene que ser uno de: ${IDIOMAS.join(", ")}.`
  }
  for (const campo of ["audiencia", "voz_marca", "cta", "evitar"] as const) {
    const texto = value[campo]
    if (typeof texto === "string" && texto.trim().length > MAX_TEXTO) {
      return `El campo "${campo}" no puede pasar de ${MAX_TEXTO} caracteres.`
    }
  }
  return null
}

/**
 * Aplica un override puntual encima de la config guardada, sin modificarla.
 *
 * Solo pisan las ranuras presentes en el override: el resto sigue viniendo de
 * la configuracion persistente, que es el modo principal.
 */
export function mergeVariables(base: Variables, override?: Partial<Variables> | null): Variables {
  if (!override) return base
  return parseVariables({ ...base, ...override })
}
