/**
 * Banco de fotos para las laminas del carrusel.
 *
 * Las imagenes NO se enlazan desde Pexels: se descargan y se suben al storage
 * junto al resto del carrusel, para que el post no dependa de un tercero.
 */

const SEARCH_URL = "https://api.pexels.com/v1/search"

/**
 * De cuantas se elige.
 *
 * Se coge una al azar del grupo en vez de la primera para que dos carruseles
 * del mismo tema no acaben con la misma foto.
 */
export const CANDIDATAS = 10

/** Debajo de esto, el filtro de cuadradas esta estrangulando la busqueda. */
const MINIMO_ACEPTABLE = 4

export type Foto = {
  id: number
  url: string
  alt: string
  autor: string
  autorUrl: string
}

export function pexelsConfigurado(): boolean {
  return Boolean(process.env.PEXELS_API_KEY)
}

type RespuestaPexels = {
  total_results?: number
  photos?: {
    id: number
    alt?: string
    photographer?: string
    photographer_url?: string
    src?: { large?: string; large2x?: string; original?: string; medium?: string }
  }[]
}

async function pedir(query: string, cuadradas: boolean): Promise<Foto[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []

  const params = new URLSearchParams({
    query,
    per_page: String(CANDIDATAS + 5),
  })
  // `size=large` se queda fuera a proposito: recorta los resultados a una
  // fraccion (2 frente a 4195 en las pruebas) y las fotos de Pexels ya vienen
  // muy por encima de los 1080 que hacen falta.
  if (cuadradas) params.set("orientation", "square")

  try {
    const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []

    const data = (await response.json()) as RespuestaPexels
    return (data.photos ?? [])
      .map((p) => ({
        id: p.id,
        url: p.src?.large ?? p.src?.large2x ?? p.src?.original ?? p.src?.medium ?? "",
        alt: p.alt ?? "",
        autor: p.photographer ?? "",
        autorUrl: p.photographer_url ?? "",
      }))
      .filter((f) => f.url.length > 0)
  } catch {
    return []
  }
}

/**
 * Busca fotos para un termino.
 *
 * Primero cuadradas, que es el formato del carrusel; si salen muy pocas se
 * repite sin ese filtro, porque las plantillas recortan igualmente y es mejor
 * una foto buena recortada que ninguna.
 */
export async function buscarFotos(query: string): Promise<Foto[]> {
  const cuadradas = await pedir(query, true)
  if (cuadradas.length >= MINIMO_ACEPTABLE) return cuadradas

  const cualquiera = await pedir(query, false)
  // Las cuadradas primero: encajan mejor aunque haya pocas.
  const vistas = new Set(cuadradas.map((f) => f.id))
  return [...cuadradas, ...cualquiera.filter((f) => !vistas.has(f.id))]
}

/**
 * Reparte fotos entre las laminas sin repetir ninguna dentro del mismo post.
 *
 * Lleva la cuenta de lo ya usado y va agotando terminos: si el primero no da
 * para todas, se pasa al siguiente en vez de repetir.
 */
export class BancoDeFotos {
  private usadas = new Set<number>()
  private pozo: Foto[] = []
  private terminosPendientes: string[]

  constructor(terminos: string[]) {
    this.terminosPendientes = [...terminos]
  }

  /** `null` cuando no queda ninguna foto nueva que ofrecer. */
  async siguiente(): Promise<Foto | null> {
    for (;;) {
      const disponibles = this.pozo.filter((f) => !this.usadas.has(f.id))

      if (disponibles.length > 0) {
        // Al azar entre las mejores, no siempre la primera.
        const tope = Math.min(disponibles.length, CANDIDATAS)
        const elegida = disponibles[Math.floor(Math.random() * tope)]
        this.usadas.add(elegida.id)
        return elegida
      }

      const termino = this.terminosPendientes.shift()
      if (!termino) return null
      this.pozo = await buscarFotos(termino)
    }
  }
}

/** Baja la foto y la deja como data URI para que Satori la dibuje. */
export async function descargarFotoPexels(foto: Foto): Promise<string | null> {
  try {
    const response = await fetch(foto.url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return null

    const tipo = response.headers.get("content-type") ?? "image/jpeg"
    if (!/^image\//i.test(tipo)) return null

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0) return null

    return `data:${tipo.split(";")[0]};base64,${Buffer.from(buffer).toString("base64")}`
  } catch {
    return null
  }
}
