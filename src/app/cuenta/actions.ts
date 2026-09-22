"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { COOKIE_CUENTA, cuentasDelUsuario } from "@/lib/accounts"

/**
 * Cambia la cuenta activa.
 *
 * Solo escribe la cookie si el usuario pertenece a esa cuenta. La comprobacion
 * es aqui y no en el cliente porque la cookie la escribe el navegador: sin esto,
 * cambiarla a mano seria la forma mas facil de leer los datos de otro.
 */
export async function cambiarCuenta(slug: string): Promise<void> {
  const cuentas = await cuentasDelUsuario()
  if (!cuentas.some((cuenta) => cuenta.slug === slug)) return

  const store = await cookies()
  store.set(COOKIE_CUENTA, slug, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  })

  // Todo el dashboard cuelga de la cuenta, asi que se invalida entero.
  revalidatePath("/", "layout")
}

/**
 * El canal de Buffer de la cuenta en una red.
 *
 * Antes era `BUFFER_CHANNEL_ID` en el entorno. Con una sola cuenta funcionaba;
 * con dos deja de servir, porque una variable no distingue cuentas y el fallo
 * seria publicar el contenido de una en las redes de la otra.
 *
 * Es el id que aparece en la URL del canal en Buffer:
 *   https://publish.buffer.com/channels/<id>/schedule
 */
export async function guardarCanalBuffer(
  red: "instagram" | "facebook",
  canal: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // La red se valida contra la lista y no se confia en lo que llegue: es una
  // accion de servidor y el nombre de columna se arma con ella.
  if (red !== "instagram" && red !== "facebook") {
    return { ok: false, error: "Red desconocida." }
  }

  const limpio = canal.trim()

  // Buffer usa ids hexadecimales de 24 caracteres. Validar la forma aqui evita
  // guardar una URL entera pegada por error y descubrirlo al publicar.
  if (limpio.length > 0 && !/^[0-9a-f]{24}$/i.test(limpio)) {
    return {
      ok: false,
      error:
        "El id del canal son 24 caracteres hexadecimales. Copialo de la URL del " +
        "canal en Buffer, no pegues la URL entera.",
    }
  }

  const { supabaseAdmin } = await import("@/engine/supabase-admin")
  const { idDeCuentaActual } = await import("@/lib/accounts")

  const { error } = await supabaseAdmin()
    .from("accounts")
    .update({
      [`buffer_${red}_channel_id`]: limpio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", await idDeCuentaActual())

  if (error) return { ok: false, error: error.message }

  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * El token de Claude que corre todos los pasos de IA.
 *
 * Global, no por cuenta: es una unica cuenta de Claude la que mueve el motor.
 * Vive en `engine_secrets` y solo lo lee la service role. La interfaz nunca
 * recibe el valor entero de vuelta —solo una vista enmascarada—, porque es un
 * secreto: mostrarlo seria filtrarlo a cualquiera que abra el panel.
 */
export type EstadoTokenClaude = {
  configurado: boolean
  /** Algo como `sk-ant-oat01…fQAA`, para reconocerlo sin exponerlo. */
  vistaPrevia: string | null
  actualizado: string | null
}

export async function estadoTokenClaude(): Promise<EstadoTokenClaude> {
  const { supabaseAdmin } = await import("@/engine/supabase-admin")
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("claude_oauth_token, claude_token_updated_at")
    .eq("id", true)
    .maybeSingle()

  const fila = data as
    | { claude_oauth_token: string | null; claude_token_updated_at: string | null }
    | null
  const valor = fila?.claude_oauth_token
  if (!valor) return { configurado: false, vistaPrevia: null, actualizado: null }

  const vista = valor.length > 16 ? `${valor.slice(0, 14)}…${valor.slice(-4)}` : "••••"
  return { configurado: true, vistaPrevia: vista, actualizado: fila?.claude_token_updated_at ?? null }
}

export async function guardarTokenClaude(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limpio = token.trim()
  const { supabaseAdmin } = await import("@/engine/supabase-admin")

  // Vacio = desconectar. Util para quitar un token revocado a proposito.
  if (limpio.length === 0) {
    const { error } = await supabaseAdmin()
      .from("engine_secrets")
      .update({ claude_oauth_token: null, claude_token_updated_at: null, updated_at: new Date().toISOString() })
      .eq("id", true)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/", "layout")
    return { ok: true }
  }

  // Se acepta el token de suscripcion (setup-token) y la API key de consola.
  if (!/^sk-ant-(oat01|api03)/.test(limpio)) {
    return {
      ok: false,
      error:
        "El token debe empezar por sk-ant-oat01 (el de `claude setup-token`) o sk-ant-api03. " +
        "El de las rutinas viejas no sirve.",
    }
  }

  const { error } = await supabaseAdmin()
    .from("engine_secrets")
    .update({
      claude_oauth_token: limpio,
      claude_token_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)

  if (error) return { ok: false, error: error.message }
  revalidatePath("/", "layout")
  return { ok: true }
}

/** Hace una llamada real y minima para ver si el token funciona de verdad. */
export async function probarConexionClaude(): Promise<
  { ok: true; modelo: string } | { ok: false; error: string }
> {
  const { llamarClaude } = await import("@/engine/claude/messages")
  const modelo = "claude-haiku-4-5-20251001"
  const r = await llamarClaude({
    model: modelo,
    system: "Responde de la forma mas breve posible.",
    prompt: "Responde solo con la palabra: ok",
    maxTokens: 16,
  })
  return r.ok ? { ok: true, modelo } : { ok: false, error: r.error }
}

/** Cambia el modelo de un paso de IA (analisis, angulo, LinkedIn, Instagram). */
export async function guardarModeloIA(
  paso: import("@/lib/modelos-ia").PasoIA,
  modelo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { guardarModelo } = await import("@/engine/claude/modelos")
    await guardarModelo(paso, modelo)
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 
 * Gemini Token Management 
 */
export type EstadoTokenGemini = {
  configurado: boolean
  vistaPrevia: string | null
}

export async function estadoTokenGemini(): Promise<EstadoTokenGemini> {
  const { supabaseAdmin } = await import("@/engine/supabase-admin")
  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("gemini_api_key")
    .eq("id", true)
    .maybeSingle()

  const valor = data?.gemini_api_key
  // Fallback a entorno
  const apiEnEntorno = process.env.GEMINI_API_KEY
  
  if (!valor && !apiEnEntorno) return { configurado: false, vistaPrevia: null }

  const tokenActivo = valor || apiEnEntorno
  const vista = tokenActivo.length > 16 ? `${tokenActivo.slice(0, 10)}…${tokenActivo.slice(-4)}` : "••••"
  return { configurado: true, vistaPrevia: vista }
}

export async function guardarTokenGemini(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limpio = token.trim()
  const { supabaseAdmin } = await import("@/engine/supabase-admin")

  if (limpio.length === 0) {
    const { error } = await supabaseAdmin()
      .from("engine_secrets")
      .update({ gemini_api_key: null, updated_at: new Date().toISOString() })
      .eq("id", true)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/", "layout")
    return { ok: true }
  }

  const { error } = await supabaseAdmin()
    .from("engine_secrets")
    .update({ gemini_api_key: limpio, updated_at: new Date().toISOString() })
    .eq("id", true)

  if (error) return { ok: false, error: error.message }
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function probarConexionGemini(): Promise<
  { ok: true; modelo: string } | { ok: false; error: string }
> {
  const { llamarGemini } = await import("@/engine/gemini/messages")
  const modelo = "gemini-1.5-flash"
  const r = await llamarGemini({
    model: modelo,
    system: "Responde de la forma mas breve posible.",
    prompt: "Responde solo con la palabra: ok",
    maxTokens: 16,
  })
  return r.ok ? { ok: true, modelo } : { ok: false, error: r.error }
}
