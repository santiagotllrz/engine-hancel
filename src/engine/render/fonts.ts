import { readFile } from "node:fs/promises"
import path from "node:path"

import { FUENTES, type NombreFuente } from "./theme"

/**
 * Carga las fuentes del disco para pasarselas al renderizador.
 *
 * Satori no usa las fuentes del sistema: hay que darle los bytes. Se leen una
 * vez y se quedan en memoria, porque un carrusel son hasta diez imagenes y
 * releer cuatro ficheros por cada una no tiene sentido.
 *
 * Admite TTF, OTF y WOFF; WOFF2 no, que es la trampa clasica aqui.
 */

export type FuenteCargada = {
  name: string
  data: ArrayBuffer
  weight: 300 | 400 | 600 | 700
  style: "normal"
}

const cache = new Map<NombreFuente, FuenteCargada[]>()

const PESOS = {
  light: 300,
  regular: 400,
  semibold: 600,
  bold: 700,
} as const

function directorio(): string {
  return path.join(process.cwd(), "src", "engine", "render", "fonts")
}

export async function cargarFuente(nombre: NombreFuente): Promise<FuenteCargada[]> {
  const yaCargada = cache.get(nombre)
  if (yaCargada) return yaCargada

  const definicion = FUENTES[nombre]
  const base = directorio()

  const cargadas = await Promise.all(
    (Object.keys(PESOS) as (keyof typeof PESOS)[]).map(async (peso) => {
      const archivo = definicion.archivos[peso]
      const bytes = await readFile(path.join(base, archivo))
      // Copia al ArrayBuffer exacto: un Buffer de Node puede ser una vista
      // sobre un pool mayor, y Satori leeria basura alrededor.
      const data = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer

      return {
        name: definicion.nombre,
        data,
        weight: PESOS[peso],
        style: "normal" as const,
      }
    })
  )

  cache.set(nombre, cargadas)
  return cargadas
}
