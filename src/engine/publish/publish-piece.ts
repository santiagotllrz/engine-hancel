import type { ContentPiece } from "../content/types"
import { supabaseAdmin } from "../supabase-admin"
import { nichosConocidos } from "../render/carousel"
import { terminosDeBusqueda } from "../render/keywords"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "../render/pexels"
import { renderTarjetaLinkedin } from "../render/render"
import { estiloDesdeConfig } from "../render/theme"
import type { RawNews } from "@/lib/types"
import { buildCommentary, publishText, subirImagen, type PublishResult } from "./linkedin"

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

  // La ilustracion es opcional: si algo falla se publica igual, solo con texto.
  const imagen = await tarjetaDelPost(piece, commentary)
  const result = await publishText(commentary, imagen)

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

/**
 * Las piezas que una tanda publicaria: generadas o aprobadas, sin publicar.
 *
 * Por orden de creacion, que es el orden en que se generaron: si una tanda no da
 * para todas, las mas viejas salen primero.
 */
export async function pendingToPublish(
  network: string,
  limite = 5
): Promise<ContentPiece[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("*")
    .eq("network", network)
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .order("created_at")
    .limit(limite)

  if (error) throw new Error(`No se pudieron leer las piezas por publicar: ${error.message}`)
  return (data ?? []) as ContentPiece[]
}

/**
 * La imagen que acompaña al post.
 *
 * Misma regla que en el carrusel: la foto sale del banco buscando el tema
 * concreto de la noticia, no su nicho, porque ilustrar "IA" con fotos de "IA"
 * devuelve siempre el mismo imaginario vacio. Encima va el titular sobre un velo
 * oscuro, que es lo que la hace legible en el feed.
 *
 * Devuelve `null` sin ruido ante cualquier problema: un post con texto y sin
 * imagen sigue sirviendo, y perderlo por la ilustracion seria absurdo.
 */
async function tarjetaDelPost(
  piece: ContentPiece,
  commentary: string
): Promise<{ urn: string; altText: string } | null> {
  try {
    const supabase = supabaseAdmin()

    const { data: cfg } = await supabase
      .from("generation_config")
      .select("carousel")
      .eq("id", true)
      .maybeSingle()

    const estilo = estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel)
    if (!estilo.usarFotos || !pexelsConfigurado()) return null

    const news = piece.raw_news_id
      ? ((
          await supabase.from("raw_news").select("*").eq("id", piece.raw_news_id).maybeSingle()
        ).data as RawNews | null)
      : null

    const banco = new BancoDeFotos(terminosDeBusqueda(news, await nichosConocidos()))
    const elegida = await banco.siguiente()
    const foto = elegida ? await descargarFotoPexels(elegida) : null

    // El titular es el hook si lo hay; si no, la primera frase del cuerpo, que
    // es donde la gramatica de LinkedIn pone el gancho.
    const titular =
      piece.payload?.hook?.trim() ||
      commentary
        .split("\n")
        .find((linea) => linea.trim().length > 0)
        ?.trim() ||
      ""

    if (!titular) return null

    const png = await renderTarjetaLinkedin(titular, foto, estilo)
    const urn = await subirImagen(png)

    return urn ? { urn, altText: titular } : null
  } catch {
    return null
  }
}
