import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"

import { buildAuthUrl, linkedinConfig } from "@/engine/publish/linkedin"

export const dynamic = "force-dynamic"

/**
 * Arranca el OAuth de LinkedIn.
 *
 * El `state` va en una cookie httpOnly y se compara en el callback: es lo que
 * impide que alguien nos haga conectar una cuenta ajena con un enlace preparado
 * (CSRF). Dura lo que dura el codigo de autorizacion, 30 minutos.
 *
 * OJO: esto no esta autenticado, como el resto del dashboard. Quien alcance la
 * URL puede iniciar la conexion — pero solo puede conectar SU propia cuenta de
 * LinkedIn, porque el consentimiento ocurre en el dominio de LinkedIn.
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

  const state = randomUUID()
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
