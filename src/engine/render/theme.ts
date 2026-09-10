/**
 * La identidad visual del carrusel, en un solo sitio.
 *
 * Separado de las plantillas a proposito: cambiar la paleta o la tipografia no
 * deberia obligar a tocar el codigo que dibuja. Todo lo que un diseñador querria
 * ajustar vive aqui.
 */

export const LIENZO = 1080

export type Paleta = {
  fondo: string
  fondoAlterno: string
  texto: string
  textoSuave: string
  acento: string
  /** Velo sobre la foto de portada: sin el, el hook no se lee. */
  velo: string
}

export const PALETA: Paleta = {
  fondo: "#0B0F14",
  fondoAlterno: "#111820",
  texto: "#F5F7FA",
  textoSuave: "#9AA7B4",
  acento: "#4ADE80",
  velo: "rgba(6, 9, 13, 0.62)",
}

/**
 * Las familias disponibles. Por ahora solo HeroFont, pero el render acepta
 * cualquiera que este en `fonts/` con estos cuatro pesos.
 */
export const FUENTES = {
  HeroFont: {
    nombre: "HeroFont",
    archivos: {
      light: "HeroFont-Light.otf",
      regular: "HeroFont-Regular.otf",
      semibold: "HeroFont-SemiBold.otf",
      bold: "HeroFont-Bold.otf",
    },
  },
} as const

export type NombreFuente = keyof typeof FUENTES

export const FUENTE_POR_DEFECTO: NombreFuente = "HeroFont"

/**
 * Escala tipografica en pixeles sobre el lienzo de 1080.
 *
 * Los tamaños son grandes a proposito: un carrusel se lee en un telefono, a
 * menudo en miniatura dentro del feed.
 */
export const ESCALA = {
  hook: 84,
  hookCorto: 104,
  titulo: 68,
  cuerpo: 44,
  pie: 28,
  numero: 26,
}

/** Margen interior. Ancho para que el texto nunca toque el borde recortado. */
export const MARGEN = 96

export type Estilo = {
  paleta: Paleta
  fuente: NombreFuente
}

export const ESTILO_POR_DEFECTO: Estilo = {
  paleta: PALETA,
  fuente: FUENTE_POR_DEFECTO,
}
