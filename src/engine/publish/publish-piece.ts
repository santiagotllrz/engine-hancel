import type { ContentPiece } from "../content/types"
import { supabaseAdmin } from "../supabase-admin"
import { nichosConocidos } from "../render/carousel"
import { terminosDeBusqueda } from "../render/keywords"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "../render/pexels"
import { descargarFoto, renderTarjetaLinkedin } from "../render/render"
import { estiloDesdeConfig } from "../render/theme"
import type { RawNews } from "@/lib/types"
import { publicarEnBuffer, resolverCanal } from "./buffer"
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

  // Cada red se publica por su via: LinkedIn contra su propia API, Instagram a
  // traves de Buffer, que ya tiene resuelta la relacion con Meta.
  const result =
    piece.network === "instagram"
      ? await publicarCarrusel(piece)
      : piece.network === "facebook"
        ? await publicarEnFacebook(piece)
        : await publicarEnLinkedin(piece)

  if (result.ok) {
    await supabase
      .from("content_pieces")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        // La columna guarda el identificador del post publicado, sea de la red
        // que sea: el URN de LinkedIn o el id que devuelve Buffer.
        linkedin_urn: result.urn,
        // Queda anotado que el post salio ilustrado, que es la unica forma de
        // comprobarlo despues sin abrir el feed.
        ...(result.imageUrn ? { image_urn: result.imageUrn } : {}),
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
 * LinkedIn: texto mas la tarjeta con el titular.
 *
 * La imagen no es opcional. Antes, si algo fallaba al dibujarla o subirla, el
 * post salia igual solo con texto; el problema es que eso no tiene arreglo
 * despues —habria que borrar el post y volver a publicarlo— y encima no dejaba
 * rastro de por que. Ahora, si no hay imagen, no hay post: la pieza se queda sin
 * publicar con el motivo escrito, y la siguiente tanda lo reintenta. Un fallo
 * pasajero se cura solo y uno de verdad se ve en la interfaz.
 */
async function publicarEnLinkedin(piece: ContentPiece): Promise<PublishResult> {
  const commentary = buildCommentary(piece.payload)
  if (!commentary.trim()) {
    return { ok: false, error: "La pieza no tiene texto que publicar." }
  }

  const tarjeta = await tarjetaDelPost(piece, commentary)
  if (!tarjeta.ok) {
    return { ok: false, error: `No se pudo preparar la imagen del post: ${tarjeta.error}` }
  }

  const resultado = await publishText(piece.account_id, commentary, tarjeta.imagen)
  return resultado.ok ? { ...resultado, imageUrn: tarjeta.imagen.urn } : resultado
}

/**
 * Instagram: el carrusel entero a Buffer.
 *
 * Las imagenes ya viven en URLs publicas del storage, que es justo lo que Buffer
 * necesita — las descarga el para validarlas y publicarlas.
 */
async function publicarCarrusel(piece: ContentPiece): Promise<PublishResult> {
  const payload = piece.payload as unknown as {
    caption?: string
    hashtags?: string[]
    images?: string[]
  }

  const imagenes = payload?.images ?? []
  if (imagenes.length === 0) {
    return { ok: false, error: "El carrusel no tiene imagenes." }
  }

  const channelId = await resolverCanal(piece.account_id, "instagram")
  if (!channelId) return { ok: false, error: sinCanal("Instagram") }

  const texto = [payload.caption, (payload.hashtags ?? []).join(" ")]
    .filter((parte) => parte && parte.trim().length > 0)
    .join("\n\n")

  const resultado = await publicarEnBuffer({ channelId, red: "instagram", texto, imagenes })

  return resultado.ok
    ? { ok: true, urn: resultado.postId }
    : { ok: false, error: resultado.error }
}

function sinCanal(red: string): string {
  return (
    `Esta cuenta no tiene canal de ${red} configurado. Ponlo en /contenido/config, ` +
    "con el id que aparece en la URL del canal en Buffer."
  )
}

/**
 * Facebook: la portada del carrusel y el texto largo, por Buffer.
 *
 * La pieza ya nacio con la forma de Facebook (ver `render/facebook.ts`): aqui
 * solo se junta el texto como lo haria LinkedIn y se manda con una imagen.
 */
async function publicarEnFacebook(piece: ContentPiece): Promise<PublishResult> {
  const imagen = piece.payload?.image
  if (!imagen) {
    return { ok: false, error: "La pieza de Facebook no tiene imagen." }
  }

  const texto = buildCommentary(piece.payload)
  if (!texto.trim()) {
    return { ok: false, error: "La pieza no tiene texto que publicar." }
  }

  const channelId = await resolverCanal(piece.account_id, "facebook")
  if (!channelId) return { ok: false, error: sinCanal("Facebook") }

  const resultado = await publicarEnBuffer({
    channelId,
    red: "facebook",
    texto,
    imagenes: [imagen],
  })

  return resultado.ok
    ? { ok: true, urn: resultado.postId }
    : { ok: false, error: resultado.error }
}

/**
 * Las piezas que una tanda publicaria: generadas o aprobadas, sin publicar.
 *
 * Por orden de creacion, que es el orden en que se generaron: si una tanda no da
 * para todas, las mas viejas salen primero.
 */
export async function pendingToPublish(
  accountId: string,
  network: string,
  limite = 5
): Promise<ContentPiece[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("*")
    .eq("account_id", accountId)
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
 * Va siempre, no como adorno: un post con imagen ocupa el doble de alto en el
 * feed que uno de solo texto, y es lo que decide si alguien se para a leerlo. El
 * tratamiento es el mismo que la portada del carrusel —foto a color, degradado y
 * titular abajo— para que las dos redes se reconozcan como la misma cuenta.
 *
 * La foto alterna entre la de la noticia y la del banco: tirar siempre de la
 * misma fuente hace que todos los posts se parezcan, y son dos imaginarios
 * distintos —el documental del medio y el mas abstracto del banco— que conviene
 * ir mezclando. Cada una hace de respaldo de la otra, asi que basta con que
 * responda una de las dos.
 *
 * La foto de fondo si es opcional —sin ella la tarjeta sale sobre el fondo
 * solido de la paleta, que sigue siendo una tarjeta— pero la tarjeta no lo es:
 * cualquier fallo vuelve con su motivo para que quien publica decida, en vez de
 * dejar salir un post pelado sin que nadie se entere.
 */
type TarjetaResult =
  | { ok: true; imagen: { urn: string; altText: string } }
  | { ok: false; error: string }

async function tarjetaDelPost(
  piece: ContentPiece,
  commentary: string
): Promise<TarjetaResult> {
  try {
    const supabase = supabaseAdmin()

    const { data: cfg } = await supabase
      .from("generation_config")
      .select("carousel")
      .eq("account_id", piece.account_id)
      .maybeSingle()

    const estilo = estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel)

    const news = piece.raw_news_id
      ? ((
          await supabase.from("raw_news").select("*").eq("id", piece.raw_news_id).maybeSingle()
        ).data as RawNews | null)
      : null

    // Apaisada: la tarjeta es 1200x627 y una foto vertical recortada ahi pierde
    // justo la cabeza del sujeto.
    const delBanco = async (): Promise<string | null> => {
      if (!estilo.usarFotos || !pexelsConfigurado()) return null
      const banco = new BancoDeFotos(
        terminosDeBusqueda(news, await nichosConocidos(piece.account_id)),
        "apaisada"
      )
      const elegida = await banco.siguiente()
      return elegida ? descargarFotoPexels(elegida) : null
    }

    const empezarPorLaNoticia = Math.random() < 0.5
    const foto = empezarPorLaNoticia
      ? ((await descargarFoto(news?.image_url)) ?? (await delBanco()))
      : ((await delBanco()) ?? (await descargarFoto(news?.image_url)))

    // El titular es el hook si lo hay; si no, la primera frase del cuerpo, que
    // es donde la gramatica de LinkedIn pone el gancho.
    const titular =
      piece.payload?.hook?.trim() ||
      commentary
        .split("\n")
        .find((linea) => linea.trim().length > 0)
        ?.trim() ||
      ""

    if (!titular) {
      return { ok: false, error: "La pieza no tiene titular con el que armar la tarjeta." }
    }

    const etiqueta = (news?.tema ?? news?.niche ?? "").trim() || null
    const png = await renderTarjetaLinkedin(titular, foto, estilo, etiqueta)

    const subida = await subirImagen(piece.account_id, png)
    if (!subida.ok) return { ok: false, error: subida.error }

    return { ok: true, imagen: { urn: subida.urn, altText: titular } }
  } catch (error) {
    // Aqui caen sobre todo los fallos de dibujo: una fuente que no esta donde se
    // espera, o un texto que Satori no sabe medir.
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `No se pudo dibujar la tarjeta: ${message}` }
  }
}
