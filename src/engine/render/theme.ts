/**
 * La identidad visual del carrusel, en un solo sitio.
 *
 * Separado de las plantillas a proposito: cambiar la paleta, la marca o la
 * tipografia no deberia obligar a tocar el codigo que dibuja. Todo lo que se
 * querria ajustar vive aqui, y lo que el usuario puede cambiar desde la interfaz
 * llega como `Estilo`.
 */

export const LIENZO = 1080

export type Paleta = {
  fondo: string
  fondoAlterno: string
  texto: string
  textoSuave: string
  acento: string
  /** Velo sobre la foto: sin el, el texto encima no se lee. */
  velo: string
  /** Para el cierre y la tarjeta, donde el texto va suelto y pide mas calma. */
  veloFuerte: string
}

export const PALETA: Paleta = {
  fondo: "#0A0A0A",
  fondoAlterno: "#141414",
  texto: "#FFFFFF",
  textoSuave: "#A1A1A1",
  acento: "#FFFFFF",
  velo: "rgba(0, 0, 0, 0.66)",
  veloFuerte: "rgba(0, 0, 0, 0.8)",
}

/**
 * Paletas listas para elegir. Todas en blanco y negro.
 *
 * Sin color a proposito: en un feed saturado, una serie estrictamente monocroma
 * se reconoce de un vistazo, y el contraste puro deja el peso en la tipografia y
 * en la foto en vez de repartirlo con un acento de color.
 *
 * El acento no desaparece —hace falta para la barra de la cita, el numero grande
 * o el punto de la marca— pero es el propio blanco o negro, asi que marca por
 * contraste y no por tono.
 */
export const PALETAS: Record<string, Paleta> = {
  negro: PALETA,
  blanco: {
    fondo: "#FFFFFF",
    fondoAlterno: "#F2F2F2",
    texto: "#0A0A0A",
    textoSuave: "#616161",
    acento: "#0A0A0A",
    // Sobre fondo claro el velo tambien aclara: si no, el texto negro no se lee.
    velo: "rgba(255, 255, 255, 0.78)",
    veloFuerte: "rgba(255, 255, 255, 0.88)",
  },
  carbon: {
    fondo: "#1C1C1C",
    fondoAlterno: "#262626",
    texto: "#FAFAFA",
    textoSuave: "#9E9E9E",
    acento: "#FAFAFA",
    velo: "rgba(12, 12, 12, 0.62)",
    veloFuerte: "rgba(8, 8, 8, 0.78)",
  },
}

export type NombrePaleta = keyof typeof PALETAS
export const PALETA_POR_DEFECTO = "negro"

/**
 * Las familias disponibles. El render acepta cualquiera que este en `fonts/`
 * con estos cuatro pesos.
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
 * Escala tipografica sobre el lienzo de 1080.
 *
 * Grande a proposito: un carrusel se lee en un telefono, a menudo en miniatura
 * dentro del feed.
 */
export const ESCALA = {
  hook: 84,
  hookCorto: 104,
  titulo: 68,
  cuerpo: 44,
  cita: 66,
  pie: 28,
  numero: 26,
}

export const MARGEN = 96

/**
 * Como se compone cada lamina.
 *
 * Existe para que el carrusel no sea cinco veces la misma diapositiva: el
 * reparto lo decide `carousel.ts` a partir del contenido, no al azar puro.
 */
export type Variante =
  | "portada"
  | "cierre"
  | "texto"
  | "foto_fondo"
  | "foto_lateral"
  | "foto_recuadro"
  | "cita"
  | "dato"

/**
 * La lamina de cierre.
 *
 * Se añade al final de todos los carruseles cuando esta encendida. Va aparte del
 * guion que escribe la rutina a proposito: es una constante de la marca, no
 * contenido de la noticia, y no tiene sentido pedirsela al modelo cada vez.
 */
export type Cierre = {
  activo: boolean
  titulo: string
  texto: string
}

export const CIERRE_POR_DEFECTO: Cierre = {
  activo: false,
  titulo: "Siguenos",
  texto: "Analisis de lo que pasa en tecnologia, sin ruido.",
}

/** Lo que el usuario puede cambiar desde la interfaz. */
export type Estilo = {
  paleta: Paleta
  fuente: NombreFuente
  /** Rotulo de la esquina superior. Vacio = sin rotulo. */
  marca: string
  /** Numerar las laminas y mostrar el "desliza". */
  mostrarPaginacion: boolean
  /** Meter fotos de banco en las laminas interiores. */
  usarFotos: boolean
  cierre: Cierre
}

export const ESTILO_POR_DEFECTO: Estilo = {
  paleta: PALETA,
  fuente: FUENTE_POR_DEFECTO,
  // Vacio por defecto: el rotulo lo pone quien quiera, no el motor.
  marca: "",
  mostrarPaginacion: true,
  usarFotos: true,
  cierre: CIERRE_POR_DEFECTO,
}

/** Arma el estilo a partir de lo guardado en `generation_config.carousel`. */
export function estiloDesdeConfig(valor: unknown): Estilo {
  const raw = (valor ?? {}) as Record<string, unknown>
  const paleta =
    typeof raw.paleta === "string" && raw.paleta in PALETAS
      ? PALETAS[raw.paleta]
      : PALETAS[PALETA_POR_DEFECTO]

  return {
    paleta,
    fuente:
      typeof raw.fuente === "string" && raw.fuente in FUENTES
        ? (raw.fuente as NombreFuente)
        : FUENTE_POR_DEFECTO,
    marca: typeof raw.marca === "string" ? raw.marca.trim().slice(0, 40) : "",
    mostrarPaginacion: raw.mostrarPaginacion !== false,
    usarFotos: raw.usarFotos !== false,
    cierre: cierreDesdeConfig(raw.cierre),
  }
}

function cierreDesdeConfig(valor: unknown): Cierre {
  const raw = (valor ?? {}) as Record<string, unknown>
  const texto = (campo: unknown, porDefecto: string, tope: number) =>
    typeof campo === "string" && campo.trim().length > 0
      ? campo.trim().slice(0, tope)
      : porDefecto

  return {
    // Apagado salvo que se diga lo contrario: añade una lamina a cada carrusel.
    activo: raw.activo === true,
    titulo: texto(raw.titulo, CIERRE_POR_DEFECTO.titulo, 40),
    texto: texto(raw.texto, CIERRE_POR_DEFECTO.texto, 140),
  }
}
