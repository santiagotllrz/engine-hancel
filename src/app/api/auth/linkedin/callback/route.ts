import { NextResponse } from "next/server"

import { exchangeCodeAndStore } from "@/engine/publish/linkedin"

export const dynamic = "force-dynamic"

/** Vuelve siempre a la pantalla de conexion, con el resultado en la URL. */
function volver(request: Request, params: Record<string, string>) {
  const destino = new URL("/contenido/config", request.url)
  for (const [clave, valor] of Object.entries(params)) {
    destino.searchParams.set(clave, valor)
  }

  const response = NextResponse.redirect(destino)
  // El state ya cumplio su funcion; dejarlo seria dar una segunda oportunidad
  // de reutilizarlo.
  response.cookies.delete("linkedin_oauth_state")
  return response
}

/**
 * Cierra el OAuth: valida el `state`, cambia el codigo por el token y guarda la
 * cuenta.
 *
 * El codigo dura 30 minutos y es de un solo uso, asi que cualquier fallo aqui
 * obliga a empezar de nuevo; por eso el mensaje viaja a la interfaz en vez de
 * quedarse en un log.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)

  const error = url.searchParams.get("error")
  if (error) {
    const detalle = url.searchParams.get("error_description") ?? error
    return volver(request, { linkedin: "error", motivo: detalle })
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) {
    return volver(request, { linkedin: "error", motivo: "LinkedIn no devolvio el codigo." })
  }

  // Comparacion contra la cookie: si no cuadra, la peticion no la empezamos
  // nosotros y no se toca nada.
  const esperado = request.headers
    .get("cookie")
    ?.split(";")
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith("linkedin_oauth_state="))
    ?.slice("linkedin_oauth_state=".length)

  if (!esperado || esperado !== state) {
    return volver(request, {
      linkedin: "error",
      motivo: "La verificacion de seguridad fallo. Vuelve a empezar la conexion.",
    })
  }

  // La cuenta viaja delante del azar en el state, que ya se comparo con la
  // cookie: llegados aqui es un valor que escribimos nosotros.
  const accountId = state.split(".")[0]
  if (!accountId) {
    return volver(request, {
      linkedin: "error",
      motivo: "El state no dice a que cuenta conectar. Vuelve a empezar.",
    })
  }

  try {
    const cuenta = await exchangeCodeAndStore(accountId, code)
    return volver(request, {
      linkedin: "ok",
      cuenta: cuenta.display_name ?? "conectada",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return volver(request, { linkedin: "error", motivo: message })
  }
}
