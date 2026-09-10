import { supabaseAdmin } from "../supabase-admin"

/**
 * Sube las imagenes del carrusel a Supabase Storage.
 *
 * El bucket es publico a proposito: al publicar, Instagram descarga cada imagen
 * desde sus propios servidores, asi que una URL firmada y efimera no le vale.
 * Lo que se sube es contenido pensado para publicarse.
 */

export const BUCKET = "carousels"

/** El orden del array ES el orden del carrusel, y no se puede perder. */
export async function subirCarrusel(
  pieceKey: string,
  imagenes: Buffer[]
): Promise<string[]> {
  const supabase = supabaseAdmin()
  const urls: string[] = []

  for (const [indice, png] of imagenes.entries()) {
    // El numero va con cero delante para que ordenar por nombre en el panel de
    // Supabase coincida con el orden real del carrusel.
    const numero = String(indice + 1).padStart(2, "0")
    const ruta = `${pieceKey}/${numero}.png`

    const { error } = await supabase.storage.from(BUCKET).upload(ruta, png, {
      contentType: "image/png",
      // Regenerar un carrusel reescribe sus imagenes en vez de acumular basura.
      upsert: true,
    })

    if (error) throw new Error(`No se pudo subir la imagen ${numero}: ${error.message}`)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
    urls.push(data.publicUrl)
  }

  return urls
}

/** Borra las imagenes de un carrusel. Se usa al descartar una pieza. */
export async function borrarCarrusel(pieceKey: string): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.storage.from(BUCKET).list(pieceKey)
  if (!data || data.length === 0) return

  await supabase.storage.from(BUCKET).remove(data.map((f) => `${pieceKey}/${f.name}`))
}
