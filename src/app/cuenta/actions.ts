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
