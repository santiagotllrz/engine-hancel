import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"

import { buildAuthUrl, linkedinConfig } from "@/engine/publish/linkedin"
import { cuentaActual } from "@/lib/accounts"

export const dynamic = "force-dynamic"

/**
 * Arranca el OAuth de LinkedIn.
 *
 * El `state` va en una cookie httpOnly y se compara en el callback: es lo que
 * impide que alguien nos haga conectar una cuenta ajena con un enlace preparado
 * (CSRF). Dura lo que dura el codigo de autorizacion, 30 minutos.
 *
 * A que cuenta se conecta va dentro del propio `state`, delante del azar. No se
 * pierde nada de seguridad: el state entero se sigue comparando con la cookie,
 * asi que un state manipulado no supera la comprobacion. Y evita una segunda
 * cookie que tendria que viajar y expirar en paralelo con esta.
 */
export async function GET() {
  if (linkedinConfig() === null) {
    return NextResponse.json(
      {
        error:
          "Faltan LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET y/o LINKEDIN_REDIRECT_URI en el entorno.",
      },
      { status: 500 }
    )
  }

  const cuenta = await cuentaActual()
  const state = `${cuenta.id}.${randomUUID()}`
  const response = NextResponse.redirect(buildAuthUrl(state))

  response.cookies.set("linkedin_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  })

  return response
}
