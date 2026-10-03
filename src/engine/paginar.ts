/**
 * Lee todas las filas de una consulta, de mil en mil.
 *
 * Supabase devuelve como maximo mil filas por consulta y corta en silencio. Con
 * listas de subtemas (100 frutas usadas en 10 temas son mil subtemas) eso deja
 * fuera filas sin aviso. `armar(desde, hasta)` es la misma consulta con su
 * `.range(desde, hasta)` y un orden estable.
 */
export async function todas<T>(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pagina = 1000
  const salida: T[] = []
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await armar(desde, desde + pagina - 1)
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as T[]
    salida.push(...filas)
    if (filas.length < pagina) return salida
  }
}
