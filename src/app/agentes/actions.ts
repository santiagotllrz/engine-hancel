"use server"

import { revalidatePath } from "next/cache"

import { agenteReal, guardarAjustes, type Agente, type Modo } from "@/engine/agents/settings"
import { PROMPT_DE_FABRICA, tienePrompt } from "@/engine/agents/prompts"
import { fichaDe, type ClaveAgente } from "@/lib/agentes-catalogo"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"
import { idDeCuentaActual } from "@/lib/accounts"

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh(clave: string) {
  revalidatePath(`/agentes/${clave}`)
  revalidatePath("/estudio")
}

/**
 * Comprueba que el agente existe y que no es un espejo.
 *
 * Facebook comparte fila con Instagram: se ve pero no se edita, porque guardar
 * ahi escribiria en la configuracion de Instagram sin que quien lo hace lo
 * espere. La pagina ya lo enseña en modo lectura; esto es el cierre del
 * servidor, que es el que de verdad tiene que impedirlo.
 */
function resolver(clave: string): { ok: true; agent: Agente } | { ok: false; error: string } {
  const ficha = fichaDe(clave)
  if (!ficha) return { ok: false, error: "Ese agente no existe." }
  if (ficha.espejoDe) {
    return {
      ok: false,
      error: `${ficha.nombre} se configura desde ${ficha.espejoDe}: comparten el mismo trabajo.`,
    }
  }
  return { ok: true, agent: agenteReal(clave as ClaveAgente as Agente) }
}

export async function guardarModo(
  clave: string,
  modo: Modo,
  canal = ""
): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r

  const ficha = fichaDe(clave)!
  if (!ficha.modos.includes(modo)) {
    return { ok: false, error: `${ficha.nombre} no admite el modo ${modo}.` }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, canal, { mode: modo })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el modo.")
  }
}

export async function guardarHorario(
  clave: string,
  horas: number[],
  minuto: number,
  canal = ""
): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r

  // Se limpia aqui y no se confia en el formulario: es una accion de servidor y
  // una hora fuera de rango dejaria al agente sin correr nunca, en silencio.
  const limpias = [...new Set(horas.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort(
    (a, b) => a - b
  )
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
    return { ok: false, error: "El minuto tiene que estar entre 0 y 59." }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, canal, {
      run_hours: limpias,
      run_minute: minuto,
    })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el horario.")
  }
}

export async function guardarModelo(clave: string, modelo: string): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r
  if (!MODELOS_DISPONIBLES.some((m) => m.id === modelo)) {
    return { ok: false, error: "Ese modelo no esta disponible." }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, "", { model: modelo })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el modelo.")
  }
}

/**
 * Guarda el prompt, o lo devuelve a fabrica.
 *
 * Vacio significa volver al del codigo, no dejar al agente sin instrucciones:
 * un prompt en blanco haria que el modelo respondiera cualquier cosa, y la
 * unica forma de recuperar el de fabrica seria copiarlo a mano de algun sitio.
 */
export async function guardarPrompt(clave: string, prompt: string): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r
  if (!tienePrompt(r.agent)) {
    return { ok: false, error: "Ese agente no usa un prompt." }
  }

  const limpio = prompt.trim()
  if (limpio.length > 0 && limpio.length < 80) {
    return {
      ok: false,
      error: "El prompt es demasiado corto. Dejalo vacio si quieres volver al de fabrica.",
    }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, "", {
      // Igual que el de fabrica tampoco se guarda: asi una correccion futura del
      // codigo le sigue llegando a quien no lo cambio de verdad.
      prompt: limpio.length === 0 || limpio === PROMPT_DE_FABRICA[r.agent].trim() ? null : limpio,
    })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el prompt.")
  }
}
