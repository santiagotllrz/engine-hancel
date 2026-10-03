import { BancoDeFotos, type Foto } from "../render/pexels"

/**
 * Las fotos del estilo Fotografico.
 *
 * El agente deja en cada lamina que foto buscar ("coffee farmer hands",
 * "avocado orchard"...). Aqui se reparte una foto distinta por lamina, sin
 * repetir ninguna dentro de la misma pieza.
 *
 * Cada foto se pide a Pexels ya recortada a la proporcion exacta de su hueco:
 * la url por defecto de Pexels es de 650 px de alto, que en una lamina de 1350
 * se ve borrosa, y una foto apaisada metida en un hueco vertical se recorta por
 * donde caiga. Pexels hace el recorte centrado a la medida pedida. La url va
 * tal cual al diseno: Canva la descarga al importarlo.
 */

export type FotoElegida = { url: string; alt: string; autor: string }

function urlRecortada(foto: Foto, ancho: number, alto: number): string {
  const base = foto.url.split("?")[0]
  const w = Math.round(Math.min(2400, ancho * 1.5))
  const h = Math.round(Math.min(3000, alto * 1.5))
  return `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`
}

/**
 * Una foto por pedido. `pedidos[i]` son los terminos preferidos de la lamina i;
 * si no dan, se sigue con los de respaldo. `null` donde no hubo ninguna.
 */
export async function elegirFotos(
  pedidos: string[][],
  respaldo: string[],
  ancho: number,
  alto: number
): Promise<(FotoElegida | null)[]> {
  const orientacion = alto >= ancho ? "vertical" : "apaisada"
  const usadas = new Set<number>()
  const general = new BancoDeFotos(respaldo.filter(Boolean), orientacion)
  const salida: (FotoElegida | null)[] = []

  for (const terminos of pedidos) {
    let elegida: Foto | null = null
    if (terminos.length) {
      const propio = new BancoDeFotos(terminos.filter(Boolean), orientacion)
      for (let i = 0; i < 6 && !elegida; i++) {
        const f = await propio.siguiente()
        if (!f) break
        if (!usadas.has(f.id)) elegida = f
      }
    }
    for (let i = 0; i < 10 && !elegida; i++) {
      const f = await general.siguiente()
      if (!f) break
      if (!usadas.has(f.id)) elegida = f
    }
    if (elegida) usadas.add(elegida.id)
    salida.push(elegida ? { url: urlRecortada(elegida, ancho, alto), alt: elegida.alt, autor: elegida.autor } : null)
  }
  return salida
}
