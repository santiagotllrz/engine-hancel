/**
 * La capa Plantilla: los estilos graficos.
 *
 * Una plantilla no es un diseno por red ni por formato: es un estilo grafico
 * transversal (Infografia, Data-viz, Fotografico, Ilustracion) que sirve a
 * cualquier receta. Define como se ve una pieza y que elementos lleva; el
 * sistema compone cada pieza para el tamano del formato de la receta.
 *
 * Cada estilo tiene dos partes:
 * - La descripcion: el texto que leen los agentes para escribir y pedir
 *   imagenes. Es lo que mas pesa en el resultado y se edita libremente.
 * - Los valores: colores, tipografia y elementos fijos (logo, numeracion,
 *   cierre), que el compositor aplica igual en todas las piezas.
 *
 * Vive en lib y no importa nada de servidor: la usan la interfaz y el motor.
 */

export type Familia = "laminas" | "imagen" | "texto"

/** A que familia de salida pertenece cada formato. Decide que campos se rellenan. */
export function familiaDeFormato(formatId: string): Familia {
  if (["ig_carrusel", "fb_carrusel", "li_documento"].includes(formatId)) return "laminas"
  if (["ig_post", "fb_post", "li_texto_imagen", "ig_historia"].includes(formatId)) return "imagen"
  // li_texto y los formatos de video (que por ahora salen como guion en parrafos).
  return "texto"
}

export const TIPOS_ESTILO = ["infografia", "dataviz", "fotografico", "ilustracion"] as const
export type TipoEstilo = (typeof TIPOS_ESTILO)[number]

/** Tipografias que Canva tiene y que se leen bien en movil. */
export const FUENTES_PLANTILLA = ["Montserrat", "Poppins", "Inter", "Oswald", "Playfair Display", "Lora"] as const

export type EstiloPlantilla = {
  colores: {
    fondo: string
    texto: string
    textoSuave: string
    /** El color del dato clave. */
    acento: string
    /** Data-viz: color semantico de subida y de bajada. */
    subida: string
    bajada: string
  }
  fuente: (typeof FUENTES_PLANTILLA)[number]
  logo: boolean
  /** "02 / 07" en las laminas de un carrusel. */
  numeracion: boolean
  /** Invitacion a deslizar en la portada de un carrusel. Vacio = sin ella. */
  textoDesliza: string
  /** Fotografico: cuanto oscurece la franja bajo el texto, 0 a 0.9. */
  velo: number
  /**
   * Ilustracion e Infografia: como se piden las imagenes al generador. Va en
   * ingles porque el generador lo entiende mejor; describe trazo, luz, fondo y
   * nivel de detalle, para que todas las imagenes del estilo parezcan del
   * mismo conjunto.
   */
  estiloVisual: string
  cierre: {
    /** "agente": la ultima lamina la escribe el agente con el CTA. "fijo": siempre igual. */
    modo: "agente" | "fijo"
    titulo: string
    texto: string
  }
}

type DefinicionTipo = {
  nombre: string
  resumen: string
  descripcion: string
  estilo: EstiloPlantilla
}

const BASE: Omit<EstiloPlantilla, "colores" | "fuente" | "estiloVisual" | "velo"> = {
  logo: true,
  numeracion: true,
  textoDesliza: "DESLIZA →",
  cierre: { modo: "agente", titulo: "Síguenos", texto: "" },
}

export const TIPOS: Record<TipoEstilo, DefinicionTipo> = {
  infografia: {
    nombre: "Infografía",
    resumen: "La imagen manda; etiquetas cortas señalan las partes. Material para guardar.",
    descripcion:
      "Estilo en el que la imagen es la protagonista y el texto es mínimo. Cada pieza comunica una sola idea que se entiende de un vistazo, sin necesidad de leer párrafos. La composición se apoya en ilustraciones o renders realistas de escenas completas, objetos o procesos, acompañados de etiquetas cortas de una a cuatro palabras que señalan las partes importantes mediante líneas, flechas o conectores. El título va en la parte superior, en tipografía gruesa, grande y de alto contraste, con un subtítulo breve debajo cuando aporta contexto. Se usan recursos de organización visual como mapas, zonas, capas, líneas de tiempo, diagramas de flujo, comparativas lado a lado y esquemas de partes. La jerarquía es clara: primero se lee el título, luego la imagen central y por último las etiquetas. El fondo es limpio o una escena integrada que no compite con la información. La paleta usa pocos colores y uno de acento para destacar el dato clave, y se mantiene coherente cuando el contenido se compone de más de una pieza. Ningún bloque de texto supera dos líneas. El resultado debe poder guardarse y consultarse después como material de referencia.",
    estilo: {
      ...BASE,
      colores: { fondo: "#F6F4EE", texto: "#121212", textoSuave: "#55534E", acento: "#1F8A4C", subida: "#1F8A4C", bajada: "#C8423B" },
      fuente: "Montserrat",
      velo: 0,
      estiloVisual:
        "Highly detailed realistic 3D render, single subject isolated and centered, soft studio lighting, clean plain light warm-gray background, no shadows on background, educational infographic look, no text, no letters, no numbers, no labels, no logos.",
    },
  },
  dataviz: {
    nombre: "Data-viz",
    resumen: "Gráficos claros con una sola lectura, acompañados de fotos reales del asunto.",
    descripcion:
      "Estilo construido alrededor de datos numéricos presentados en gráficos. El elemento central es una visualización clara: barras horizontales o verticales, líneas de tendencia, rankings, tablas simplificadas, indicadores con flechas de subida o bajada, o tarjetas con cifras grandes. Cada gráfico muestra una sola lectura principal y se elimina todo lo que no ayuda a entenderla, como cuadrículas densas, decimales innecesarios o leyendas largas. Las cifras clave aparecen en tipografía grande y gruesa, con su unidad visible, y las variaciones se marcan con color semántico: un color para subida, otro para bajada y uno neutro para estable. El título enuncia la conclusión del dato, no solo el tema. Se incluye siempre la fecha o el periodo de los datos y la fuente en texto pequeño al pie. Los nombres de productos o categorías van junto a su barra o cifra, nunca separados en una leyenda. El fondo es plano y limpio para que los números resalten. El gráfico se acompaña de una fotografía real del asunto (el cultivo, el producto, el lugar o la labor de la que hablan los datos), en una franja que da contexto y aterriza la cifra en algo tangible, sin competir con ella. La lectura debe funcionar en la pantalla de un celular sin hacer zoom.",
    estilo: {
      ...BASE,
      colores: { fondo: "#FFFFFF", texto: "#111111", textoSuave: "#6B6B6B", acento: "#1F8A4C", subida: "#1F8A4C", bajada: "#C8423B" },
      fuente: "Inter",
      velo: 0,
      estiloVisual: "",
    },
  },
  fotografico: {
    nombre: "Fotográfico",
    resumen: "La foto real manda; recursos gráficos de apoyo dan ritmo y explican.",
    descripcion:
      "Estilo en el que una fotografía real o realista es la protagonista y ocupa la mayor parte del espacio. La imagen muestra personas, lugares, productos o situaciones auténticas, con luz natural, encuadres cercanos y escenas reconocibles para la audiencia, evitando el aspecto de banco de imágenes genérico. El texto se superpone de forma limitada: un titular corto en tipografía gruesa, ubicado en una zona de la foto con espacio negativo o sobre una franja o degradado que garantice el contraste y la legibilidad. No se cubren rostros ni el sujeto principal con texto. Cuando el contenido se compone de más de una pieza, las fotos mantienen un tratamiento de color y encuadre consistente. Aunque la fotografía es la protagonista, la composición no es plana: alterna láminas con la foto a sangre y láminas con la foto arriba y un panel sólido para el texto, y se apoya en recursos gráficos que explican y dan ritmo, como una cifra destacada en una tarjeta, una etiqueta que nombra la idea, el número de un paso o una lista corta con marcas. Cada recurso es breve y está al servicio de la foto, nunca la tapa. El tono es cercano, real y documental. El resultado transmite credibilidad y conexión emocional, y deja una idea clara en cada lámina.",
    estilo: {
      ...BASE,
      colores: { fondo: "#0A0A0A", texto: "#FFFFFF", textoSuave: "#D9D9D9", acento: "#F2C94C", subida: "#3CCB7F", bajada: "#FF6B6B" },
      fuente: "Montserrat",
      velo: 0.62,
      estiloVisual: "",
    },
  },
  ilustracion: {
    nombre: "Ilustración",
    resumen: "Dibujos planos, amables y didácticos; mismo trazo y paleta en todo el conjunto.",
    descripcion:
      "Estilo resuelto con dibujos o gráficos ilustrados en lugar de fotografías. El trazo es plano o semi-plano, con formas simples, contornos limpios, colores sólidos y pocas sombras, de manera que los elementos se reconozcan al instante incluso en tamaño pequeño. Se usa para explicar procesos, mostrar partes de algo, representar conceptos abstractos o recrear situaciones que serían difíciles de fotografiar. Los personajes, si aparecen, son sencillos y expresivos, con gestos que refuerzan el mensaje. El texto es breve y se integra en la composición mediante títulos, etiquetas o globos de diálogo. Todas las ilustraciones comparten trazo, paleta y nivel de detalle para que se perciban como un conjunto. El fondo es plano o con texturas suaves. El resultado debe sentirse amable, didáctico y fácil de entender sin conocimientos previos.",
    estilo: {
      ...BASE,
      colores: { fondo: "#FBF6EC", texto: "#1E2A22", textoSuave: "#4D5C51", acento: "#E2703A", subida: "#2E8B57", bajada: "#D1495B" },
      fuente: "Poppins",
      velo: 0,
      estiloVisual:
        "Flat vector illustration, semi-flat style, simple shapes, clean dark outlines, solid colors, minimal shadows, plain warm off-white background, friendly and didactic, consistent line weight, no text, no letters, no numbers, no labels, no logos.",
    },
  },
}

/** Mezcla lo guardado con los valores por defecto de su tipo. */
export function normalizarEstilo(v: unknown, tipo: TipoEstilo = "fotografico"): EstiloPlantilla {
  const e = (v ?? {}) as Partial<EstiloPlantilla>
  const d = TIPOS[tipo].estilo
  const velo = Number(e.velo ?? d.velo)
  return {
    colores: { ...d.colores, ...(e.colores ?? {}) },
    fuente: FUENTES_PLANTILLA.includes(e.fuente as EstiloPlantilla["fuente"]) ? (e.fuente as EstiloPlantilla["fuente"]) : d.fuente,
    logo: typeof e.logo === "boolean" ? e.logo : d.logo,
    numeracion: typeof e.numeracion === "boolean" ? e.numeracion : d.numeracion,
    textoDesliza: typeof e.textoDesliza === "string" ? e.textoDesliza : d.textoDesliza,
    velo: Number.isFinite(velo) ? Math.min(0.9, Math.max(0, velo)) : d.velo,
    estiloVisual: typeof e.estiloVisual === "string" && e.estiloVisual.trim() ? e.estiloVisual : d.estiloVisual,
    cierre: { ...d.cierre, ...(e.cierre ?? {}) },
  }
}

export function esTipo(v: unknown): v is TipoEstilo {
  return typeof v === "string" && (TIPOS_ESTILO as readonly string[]).includes(v)
}
