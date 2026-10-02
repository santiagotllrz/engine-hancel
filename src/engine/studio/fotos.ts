import { BancoDeFotos, type Foto } from "../render/pexels"
import { canvaMcp } from "./canva-mcp"

/**
 * Las fotos de una pieza dibujada en Canva.
 *
 * El agente de contenido deja en la pieza sus busquedas ("coffee plantation",
 * "soil sample"...). Aqui se reparte una foto distinta por hueco de la
 * plantilla, sin repetir ninguna dentro de la misma pieza, y se sube a Canva.
 *
 * Cada foto se pide a Pexels ya recortada a la proporcion exacta de su hueco:
 * la url por defecto de Pexels es de 650 px de alto, que en una portada de 1350
 * se ve borrosa, y una foto apaisada metida en un hueco vertical la recorta
 * Canva por donde quiere. Pexels hace el recorte centrado a la medida pedida.
 */

export type Hueco = { elementId: string; ancho: number; alto: number }

export type FotoPuesta = { elementId: string; assetId: string; alt: string; autor: string; url: string }

/** La url de Pexels recortada al hueco, con margen de resolucion. */
function urlRecortada(foto: Foto, ancho: number, alto: number): string {
  const base = foto.url.split("?")[0]
  const w = Math.round(Math.min(2400, ancho * 1.5))
  const h = Math.round(Math.min(3000, alto * 1.5))
  return `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`
}

/**
 * Elige y sube una foto por hueco. Los huecos que se quedan sin foto conservan
 * la de muestra de la plantilla: una pieza con una foto generica es mejor que
 * una pieza que no sale.
 */
export async function ponerFotos(
  terminos: string[],
  huecos: Hueco[],
  respaldo: string[]
): Promise<{ puestas: FotoPuesta[]; avisos: string[] }> {
  if (huecos.length === 0) return { puestas: [], avisos: [] }

  const vertical = huecos[0].alto >= huecos[0].ancho
  const banco = new BancoDeFotos(
    [...terminos, ...respaldo].filter((t) => t.trim().length > 0),
    vertical ? "vertical" : "apaisada"
  )

  const elegidas: { hueco: Hueco; foto: Foto }[] = []
  for (const hueco of huecos) {
    const foto = await banco.siguiente()
    if (foto) elegidas.push({ hueco, foto })
  }

  const avisos: string[] = []
  if (elegidas.length < huecos.length) avisos.push(`Solo hubo ${elegidas.length} fotos para ${huecos.length} huecos.`)

  // Subidas de tres en tres: Canva tarda unos segundos por foto.
  const puestas: FotoPuesta[] = []
  for (let i = 0; i < elegidas.length; i += 3) {
    const tanda = await Promise.all(
      elegidas.slice(i, i + 3).map(async ({ hueco, foto }) => {
        const url = urlRecortada(foto, hueco.ancho, hueco.alto)
        const r = await canvaMcp<{ job?: { asset?: { id?: string }; status?: string } }>(
          "CANVA_MCP_UPLOAD_ASSET_FROM_URL",
          { url, name: `foto-${foto.id}` },
          60_000
        )
        if (!r.ok || !r.data.job?.asset?.id) {
          avisos.push(`No se pudo subir una foto: ${r.ok ? "Canva no devolvio el asset" : r.error}`)
          return null
        }
        return { elementId: hueco.elementId, assetId: r.data.job.asset.id, alt: foto.alt || "foto", autor: foto.autor, url }
      })
    )
    for (const p of tanda) if (p) puestas.push(p)
  }

  return { puestas, avisos }
}
