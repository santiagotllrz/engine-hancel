import opentype from "opentype.js"

/**
 * El ancho real de un texto en la tipografia del estilo.
 *
 * El compositor parte las lineas y apila los elementos segun lo que mide cada
 * texto. Con un ancho promedio por letra ("0,66 del tamano") se equivocaba
 * justo donde mas importa: cifras, "m", "%" o el triangulo de variacion son mas
 * anchos que el promedio, la linea no cabia, Canva la partia por su cuenta y el
 * texto crecia hacia abajo encima del siguiente. Aqui se mide con los anchos de
 * cada letra en el archivo de la fuente, el mismo que usa Canva.
 *
 * Las fuentes se bajan de Google Fonts en TTF (lo que sirve la API a un cliente
 * sin navegador) y quedan en memoria mientras viva la funcion.
 */

const PESOS = [400, 700, 800] as const
export type Peso = (typeof PESOS)[number]

const fuentes = new Map<string, opentype.Font>()
const cargando = new Map<string, Promise<void>>()

async function bajar(familia: string, peso: number): Promise<opentype.Font | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:wght@${peso}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!css.ok) return null
    const url = /url\((https:[^)]+\.ttf)\)/.exec(await css.text())?.[1]
    if (!url) return null
    const ttf = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!ttf.ok) return null
    return opentype.parse(await ttf.arrayBuffer())
  } catch {
    return null
  }
}

/** Deja en memoria los pesos de una familia. Si alguno no existe, se usa el mas cercano. */
export function cargarFuente(familia: string): Promise<void> {
  const previa = cargando.get(familia)
  if (previa) return previa
  const p = (async () => {
    const bajadas = await Promise.all(PESOS.map(async (peso) => [peso, await bajar(familia, peso)] as const))
    for (const [peso, f] of bajadas) if (f) fuentes.set(`${familia}|${peso}`, f)
  })()
  cargando.set(familia, p)
  return p
}

function fuenteDe(familia: string, peso: number): opentype.Font | null {
  // El peso pedido o, si la familia no lo tiene, el mas grueso que haya por
  // debajo; si no, cualquiera.
  const orden = [...PESOS].sort((a, b) => Math.abs(a - peso) - Math.abs(b - peso) || b - a)
  for (const p of orden) {
    const f = fuentes.get(`${familia}|${p}`)
    if (f) return f
  }
  return null
}

/**
 * Ancho de `t` a `size` px, o null si la fuente no esta cargada. Las letras que
 * la fuente no tiene (Canva las pinta con otra) cuentan un cuadratin entero.
 */
export function anchoReal(t: string, size: number, familia: string, peso: number): number | null {
  const f = fuenteDe(familia, peso)
  if (!f) return null
  let unidades = 0
  const glifos = f.stringToGlyphs(t)
  for (let i = 0; i < glifos.length; i++) {
    const g = glifos[i]
    unidades += g.index === 0 ? f.unitsPerEm : (g.advanceWidth ?? f.unitsPerEm * 0.6)
    if (i > 0 && glifos[i - 1].index && g.index) unidades += f.getKerningValue(glifos[i - 1], g)
  }
  return (unidades / f.unitsPerEm) * size
}
