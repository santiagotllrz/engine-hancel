/**
 * Iconos para los estilos de datos (Data-viz e Infografía de datos).
 *
 * Canva no deja buscar los elementos de su biblioteca desde la API, pero si
 * importa un SVG que venga en el HTML como imagen (comprobado): el icono llega
 * al diseno como un elemento mas, recoloreado con la paleta del estilo. Se
 * buscan en Iconify, que reune las colecciones abiertas, con preferencia por
 * Phosphor relleno para que todos los iconos de una pieza sean del mismo juego.
 */

const API = "https://api.iconify.design"

/** Colecciones por orden de preferencia: mismo trazo primero, cobertura despues. */
const PREFIJOS = ["ph", "mdi", "material-symbols", "tabler", "game-icons", "fluent"]

const cache = new Map<string, string | null>()

function puntaje(icono: string): number {
  const [prefijo, nombre = ""] = icono.split(":")
  const orden = PREFIJOS.indexOf(prefijo)
  let p = (orden < 0 ? PREFIJOS.length : orden) * 10
  if (prefijo === "ph") p += nombre.endsWith("-fill") ? 0 : /-(thin|light|bold|duotone)$/.test(nombre) ? 6 : 2
  if (/outline|-thin|-light/.test(nombre)) p += 3
  return p
}

/** El nombre Iconify ("ph:plant-fill") mas adecuado para un termino en ingles. */
async function buscar(termino: string): Promise<string | null> {
  const t = termino.trim().toLowerCase()
  if (!t) return null
  if (cache.has(t)) return cache.get(t)!
  // Si la frase no da nada, se prueba con su ultima palabra ("coffee cherry" -> "cherry").
  const intentos = [t, ...(t.includes(" ") ? [t.split(/\s+/).pop()!] : [])]
  for (const q of intentos) {
    try {
      const res = await fetch(`${API}/search?query=${encodeURIComponent(q)}&limit=64&prefixes=${PREFIJOS.join(",")}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      const { icons } = (await res.json()) as { icons?: string[] }
      if (!icons?.length) continue
      const mejor = [...icons].sort((a, b) => puntaje(a) - puntaje(b))[0]
      cache.set(t, mejor)
      return mejor
    } catch {
      // Se prueba el siguiente.
    }
  }
  cache.set(t, null)
  return null
}

/** La url del SVG de un icono para un termino, en el color dado; null si no hay. */
export async function urlIcono(termino: string | undefined, color: string): Promise<string | null> {
  if (!termino) return null
  const icono = await buscar(termino)
  if (!icono) return null
  const [prefijo, nombre] = icono.split(":")
  return `${API}/${prefijo}/${nombre}.svg?color=${encodeURIComponent(color)}&width=256&height=256`
}
