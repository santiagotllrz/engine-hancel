/**
 * La identidad visual del carrusel, en un solo sitio.
 *
 * Separado de las plantillas a proposito: cambiar la paleta, la marca o la
 * tipografia no deberia obligar a tocar el codigo que dibuja. Todo lo que se
 * querria ajustar vive aqui, y lo que el usuario puede cambiar desde la interfaz
 * llega como `Estilo`.
 */

/**
 * El lienzo del carrusel: 4:5 vertical, no cuadrado.
 *
 * Instagram admite hasta 4:5 y es el formato que mas alto ocupa en el feed: el
 * mismo post gana un tercio de pantalla frente al cuadrado, y esa altura es
 * justo lo que deja poner la foto arriba y el titular abajo sin apretar.
 */
export const ANCHO = 1080
export const ALTO = 1350

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
  /** Los tres cortes del degradado que funde la foto en el fondo. */
  fundido: [string, string, string]
  /** Banda superior sobre la foto, para que la marca se lea sobre un cielo claro. */
  veloTecho: string
}

export const PALETA: Paleta = {
  fondo: "#0A0A0A",
  fondoAlterno: "#141414",
  texto: "#FFFFFF",
  textoSuave: "#A1A1A1",
  acento: "#FFFFFF",
  velo: "rgba(0, 0, 0, 0.66)",
  veloFuerte: "rgba(0, 0, 0, 0.8)",
  fundido: ["rgba(10, 10, 10, 0)", "rgba(10, 10, 10, 0.92)", "#0A0A0A"],
  veloTecho: "rgba(10, 10, 10, 0.55)",
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
    fundido: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.94)", "#FFFFFF"],
    veloTecho: "rgba(255, 255, 255, 0.62)",
  },
  carbon: {
    fondo: "#1C1C1C",
    fondoAlterno: "#262626",
    texto: "#FAFAFA",
    textoSuave: "#9E9E9E",
    acento: "#FAFAFA",
    velo: "rgba(12, 12, 12, 0.62)",
    veloFuerte: "rgba(8, 8, 8, 0.78)",
    fundido: ["rgba(28, 28, 28, 0)", "rgba(28, 28, 28, 0.92)", "#1C1C1C"],
    veloTecho: "rgba(28, 28, 28, 0.55)",
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
 * Escala tipografica sobre el lienzo de 1080x1350.
 *
 * Grande a proposito: un carrusel se lee en un telefono, a menudo en miniatura
 * dentro del feed.
 */
export const ESCALA = {
  /** Portada. */
  hook: 92,
  /** Titulo de lamina. */
  titulo: 64,
  /** Descripcion: el cuerpo de texto de cualquier lamina. */
  cuerpo: 46,
  /** Frase suelta de las laminas de cita. */
  cita: 60,
  /** Etiqueta en versalitas bajo una cita. */
  etiqueta: 30,
  /** Antetitulo de la portada: el tema, en versalitas sobre el hook. */
  antetitulo: 30,
  pie: 28,
  numero: 26,
}

/**
 * Cuanto texto cabe en cada hueco antes de desbordar.
 *
 * Los tamaños son fijos —un titulo se ve igual en todas las laminas, y lo mismo
 * una descripcion— porque encogerlos segun el largo hacia que cada lamina
 * tuviera su propia escala y el carrusel se leyera desparejo. El precio de la
 * consistencia es que un texto muy largo hay que recortarlo, y es mejor
 * recortarlo con puntos suspensivos que dejar que Satori lo corte a media
 * palabra contra el borde.
 */
export const TOPES = {
  // Corto a proposito: en la portada el hook va abajo, sobre el fondo del
  // degradado, y pasar de cuatro o cinco lineas se come la foto que tiene que
  // atraer la mirada. Es un titular, no un resumen.
  hook: 100,
  titulo: 80,
  /** El hueco de la descripcion cambia segun la composicion. */
  cuerpoAmplio: 420,
  cuerpoAjustado: 300,
  cita: 260,
  antetitulo: 34,
}

/**
 * El marco: el aire que ninguna lamina invade.
 *
 * Es el mismo en las ocho composiciones y en las cuatro esquinas, y todo
 * —titulares, cuerpos, fotos de contenido, numeracion— vive dentro. Es lo unico
 * que hace que ocho maquetaciones distintas se lean como una serie: si cada
 * lamina empezara su texto a una altura distinta, el carrusel parecerian ocho
 * posts pegados.
 *
 * La excepcion es la foto de fondo, que va a sangre por debajo del marco. Ahi no
 * es contenido sino lienzo, y recuadrarla dejaria un borde que compite con el
 * texto en vez de sostenerlo.
 */
export const MARGEN = 84

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
