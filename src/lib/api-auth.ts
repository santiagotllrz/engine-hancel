/**
 * Autorizacion de los endpoints que dispara el motor.
 *
 * Falla cerrado: sin `INGEST_SECRET` configurado nadie puede dispararlos. Un
 * endpoint que gasta cuota y escribe en la base no puede quedar abierto por
 * olvidar una variable de entorno.
 *
 * Acepta `Authorization: Bearer <secreto>` (que es como lo manda pg_net desde
 * Postgres) y `x-ingest-secret`, para cualquier otro disparador.
 *
 * `/api/ingest` y `/api/content/tick` comparten secreto a proposito: son la
 * misma maquinaria disparada por el mismo Postgres, y un segundo secreto solo
 * añadiria superficie de rotacion.
 *
 * Devuelve el motivo del rechazo, o `null` si la peticion es legitima.
 */
export function authorizeEngineRequest(request: Request): string | null {
  const expected = process.env.INGEST_SECRET
  if (!expected) return "INGEST_SECRET no esta configurado en el servidor."

  const header = request.headers.get("authorization")
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null
  const provided = bearer ?? request.headers.get("x-ingest-secret")

  if (provided !== expected) return "Secreto invalido."
  return null
}
