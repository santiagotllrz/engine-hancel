import type { ContentPiece } from "../content/types"
import { supabaseAdmin } from "../supabase-admin"
import { buildCommentary, publishText, type PublishResult } from "./linkedin"

/**
 * Publica una pieza y anota el resultado en su fila.
 *
 * La guarda contra publicar dos veces es `published_at`: se comprueba antes de
 * llamar a LinkedIn y se escribe justo despues. No es una transaccion, asi que
 * dos publicaciones simultaneas de la misma pieza podrian colarse; en la
 * practica solo hay dos disparadores (el boton y el tick) y el boton se
 * deshabilita al publicar.
 */
export async function publishPiece(pieceId: string): Promise<PublishResult> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", pieceId)
    .single()

  if (error) return { ok: false, error: `No se encontro la pieza: ${error.message}` }

  const piece = data as ContentPiece & { published_at: string | null; linkedin_urn: string | null }

  if (piece.published_at) {
    return { ok: false, error: "Esta pieza ya se publico." }
  }
  if (piece.status === "rejected") {
    return { ok: false, error: "La pieza esta rechazada; no se publica." }
  }

  const commentary = buildCommentary(piece.payload)
  if (!commentary.trim()) {
    return { ok: false, error: "La pieza no tiene texto que publicar." }
  }

  const result = await publishText(commentary)

  if (result.ok) {
    await supabase
      .from("content_pieces")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        linkedin_urn: result.urn,
        publish_error: null,
      })
      .eq("id", pieceId)
  } else {
    // El error se guarda para poder verlo en la interfaz sin abrir logs.
    await supabase
      .from("content_pieces")
      .update({ publish_error: result.error.slice(0, 1000) })
      .eq("id", pieceId)
  }

  return result
}

/** Las piezas que el modo automatico publicaria: generadas o aprobadas, sin publicar. */
export async function pendingToPublish(limite = 5): Promise<ContentPiece[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("*")
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .order("created_at")
    .limit(limite)

  if (error) throw new Error(`No se pudieron leer las piezas por publicar: ${error.message}`)
  return (data ?? []) as ContentPiece[]
}
