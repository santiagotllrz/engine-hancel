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
}

export const PALETA: Paleta = {
  fondo: "#0B0F14",
  fondoAlterno: "#111820",
  texto: "#F5F7FA",
  textoSuave: "#9AA7B4",
  acento: "#4ADE80",
  velo: "rgba(6, 9, 13, 0.62)",
}

/** Paletas listas para elegir desde la interfaz. */
export const PALETAS: Record<string, Paleta> = {
  noche: PALETA,
  papel: {
    fondo: "#F7F5F0",
    fondoAlterno: "#EFEBE3",
    texto: "#14110D",
    textoSuave: "#6B6357",
    acento: "#C2410C",
    velo: "rgba(20, 17, 13, 0.45)",
  },
  tinta: {
    fondo: "#101418",
    fondoAlterno: "#1B2027",
    texto: "#F2F4F7",
    textoSuave: "#98A2B3",
    acento: "#7C9CF5",
    velo: "rgba(10, 13, 16, 0.6)",
  },
  bosque: {
    fondo: "#08120D",
    fondoAlterno: "#0F1D16",
    texto: "#F0F5F2",
    textoSuave: "#8FA69A",
    acento: "#34D399",
    velo: "rgba(4, 12, 8, 0.6)",
  },
}

export type NombrePaleta = keyof typeof PALETAS
export const PALETA_POR_DEFECTO = "noche"

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
