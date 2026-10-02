/**
 * La capa Plantilla: los valores que definen el estilo de una pieza.
 *
 * Una plantilla no es un prompt que un generador de imagenes interpreta como
 * quiere: es un layout con campos claros. Con estos valores el sistema construye
 * en Canva un diseno maestro (portada, laminas de contenido y cierre) con
 * marcadores donde va el texto y huecos donde van las fotos. Cada pieza es una
 * copia de ese maestro: el texto y las fotos cambian, el estilo no.
 *
 * Despues de crearla se puede abrir en Canva y retocarla a mano (mover cosas,
 * cambiar tipografias, poner un fondo). Mientras los marcadores sigan ahi, el
 * sistema la vuelve a leer y la sigue usando.
 *
 * Vive en lib y no importa nada de servidor: la usan el formulario y el motor.
 */

import { formatoPorId } from "./canales-catalogo"

export type Familia = "laminas" | "imagen" | "texto"

/** A que familia de salida pertenece cada formato. Decide que campos se rellenan. */
export function familiaDeFormato(formatId: string): Familia {
  if (["ig_carrusel", "fb_carrusel", "li_documento"].includes(formatId)) return "laminas"
  if (["ig_post", "fb_post", "li_texto_imagen", "ig_historia"].includes(formatId)) return "imagen"
  // li_texto y los formatos de video (que por ahora salen como guion en parrafos).
  return "texto"
}

/** Los formatos para los que hoy se puede crear una plantilla en Canva. */
export function admitePlantilla(formatId: string): boolean {
  const f = formatoPorId(formatId)
  return Boolean(f?.formato.conPlantilla) && familiaDeFormato(formatId) !== "texto"
}

/** Tipografias que Canva tiene y que se leen bien en movil. */
export const FUENTES_PLANTILLA = ["Montserrat", "Poppins", "Inter", "Oswald", "Playfair Display", "Lora"] as const

export type EstiloPlantilla = {
  colores: {
    fondo: string
    texto: string
    textoSuave: string
    acento: string
  }
  fuente: (typeof FUENTES_PLANTILLA)[number]
  /** Laminas de contenido entre portada y cierre: el tope de un carrusel. */
  laminasContenido: number
  portada: {
    /** Foto a sangre detras del hook. */
    foto: boolean
    /** Cuanto oscurece el velo sobre la foto, 0 a 0.9. */
    velo: number
    posicionTexto: "abajo" | "centro"
    /** Tamano del hook en px. */
    tamanoHook: number
    logo: boolean
    textoDesliza: string
  }
  contenido: {
    foto: "arriba" | "fondo" | "ninguna"
    numeracion: boolean
  }
  cierre: {
    /** "agente": el cierre lo escribe el agente (con el CTA). "fijo": siempre igual. */
    modo: "agente" | "fijo"
    titulo: string
    texto: string
    logo: boolean
  }
}

export const ESTILO_POR_DEFECTO: EstiloPlantilla = {
  colores: { fondo: "#0A0A0A", texto: "#FFFFFF", textoSuave: "#C8C8C8", acento: "#8C8C8C" },
  fuente: "Montserrat",
  laminasContenido: 6,
  portada: {
    foto: true,
    velo: 0.55,
    posicionTexto: "abajo",
    tamanoHook: 78,
    logo: true,
    textoDesliza: "DESLIZA →",
  },
  contenido: { foto: "arriba", numeracion: true },
  cierre: { modo: "agente", titulo: "Síguenos", texto: "", logo: true },
}

/** Mezcla lo guardado con los valores por defecto, para filas viejas o a medias. */
export function normalizarEstilo(v: unknown): EstiloPlantilla {
  const e = (v ?? {}) as Partial<EstiloPlantilla>
  const d = ESTILO_POR_DEFECTO
  const laminas = Math.round(Number(e.laminasContenido ?? d.laminasContenido))
  return {
    colores: { ...d.colores, ...(e.colores ?? {}) },
    fuente: FUENTES_PLANTILLA.includes(e.fuente as EstiloPlantilla["fuente"]) ? (e.fuente as EstiloPlantilla["fuente"]) : d.fuente,
    laminasContenido: Number.isFinite(laminas) ? Math.min(8, Math.max(2, laminas)) : d.laminasContenido,
    portada: { ...d.portada, ...(e.portada ?? {}) },
    contenido: { ...d.contenido, ...(e.contenido ?? {}) },
    cierre: { ...d.cierre, ...(e.cierre ?? {}) },
  }
}

/** Lo que el sistema leyo del diseno maestro en Canva. */
export type EstructuraPlantilla = {
  paginas: { numero: number; rol: "portada" | "contenido" | "cierre" | "unica" }[]
  marcadores: string[]
}

export const MARCADORES = ["hook", "titulo", "cuerpo", "n"] as const
