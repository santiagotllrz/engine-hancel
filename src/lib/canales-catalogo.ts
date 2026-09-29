/**
 * Los canales y sus formatos, universales.
 *
 * No se crean ni se editan desde la interfaz: son un hecho de cada red, no una
 * decision de la cuenta. Viven en codigo para que la pantalla de capas los
 * pinte y para que el bloque 2 (canal -> formato -> plantilla) sepa que existe.
 *
 * Cada formato trae su tamano real en px y su proporcion, que es lo que la
 * previsualizacion dibuja como un frame: un carrusel es un rectangulo vertical
 * 4:5, una historia uno 9:16. Ver la forma del lienzo antes de elegir evita
 * escribir para el sitio equivocado.
 */

export type FormatoCanal = {
  id: string
  nombre: string
  /** El lienzo real, para el frame de la previsualizacion. */
  ancho: number
  alto: number
  /** Una linea: para que sirve y que lo distingue. */
  resumen: string
  /**
   * Admite plantilla de estilo. Los formatos de imagen si; los de solo texto
   * (un post de LinkedIn) no tienen nada visual que plantillar.
   */
  conPlantilla: boolean
}

export type Canal = {
  id: string
  nombre: string
  /** El nombre de la conexion que lo activa, para enlazar con Conexiones. */
  conexion: "linkedin" | "instagram" | "facebook"
  color: string
  formatos: FormatoCanal[]
}

export const CANALES: Canal[] = [
  {
    id: "instagram",
    nombre: "Instagram",
    conexion: "instagram",
    color: "#E1306C",
    formatos: [
      {
        id: "ig_carrusel",
        nombre: "Carrusel",
        ancho: 1080,
        alto: 1350,
        resumen: "Hasta 10 laminas 4:5. El formato que mas alto ocupa en el feed.",
        conPlantilla: true,
      },
      {
        id: "ig_post",
        nombre: "Post",
        ancho: 1080,
        alto: 1080,
        resumen: "Una sola imagen cuadrada.",
        conPlantilla: true,
      },
      {
        id: "ig_reel",
        nombre: "Reel",
        ancho: 1080,
        alto: 1920,
        resumen: "Video vertical 9:16. Video, luego.",
        conPlantilla: true,
      },
      {
        id: "ig_historia",
        nombre: "Historia",
        ancho: 1080,
        alto: 1920,
        resumen: "Vertical 9:16, efimera. Imagen o video.",
        conPlantilla: true,
      },
    ],
  },
  {
    id: "facebook",
    nombre: "Facebook",
    conexion: "facebook",
    color: "#1877F2",
    formatos: [
      {
        id: "fb_post",
        nombre: "Post con imagen",
        ancho: 1200,
        alto: 630,
        resumen: "Imagen apaisada y texto largo debajo.",
        conPlantilla: true,
      },
      {
        id: "fb_carrusel",
        nombre: "Carrusel",
        ancho: 1080,
        alto: 1080,
        resumen: "Varias imagenes cuadradas deslizables.",
        conPlantilla: true,
      },
      {
        id: "fb_reel",
        nombre: "Reel",
        ancho: 1080,
        alto: 1920,
        resumen: "Video vertical 9:16. Video, luego.",
        conPlantilla: true,
      },
    ],
  },
  {
    id: "linkedin",
    nombre: "LinkedIn",
    conexion: "linkedin",
    color: "#0A66C2",
    formatos: [
      {
        id: "li_texto",
        nombre: "Solo texto",
        ancho: 0,
        alto: 0,
        resumen: "El post de texto puro. Sin nada visual que plantillar.",
        conPlantilla: false,
      },
      {
        id: "li_texto_imagen",
        nombre: "Texto con imagen",
        ancho: 1200,
        alto: 627,
        resumen: "El post con una tarjeta apaisada.",
        conPlantilla: true,
      },
      {
        id: "li_documento",
        nombre: "Documento (PDF)",
        ancho: 1080,
        alto: 1350,
        resumen: "Un PDF de varias paginas, deslizable como carrusel.",
        conPlantilla: true,
      },
      {
        id: "li_texto_video",
        nombre: "Texto con video",
        ancho: 1080,
        alto: 1080,
        resumen: "El post con un video. Video, luego.",
        conPlantilla: true,
      },
    ],
  },
]

export function canalPorId(id: string): Canal | null {
  return CANALES.find((c) => c.id === id) ?? null
}

export function formatoPorId(id: string): { canal: Canal; formato: FormatoCanal } | null {
  for (const canal of CANALES) {
    const formato = canal.formatos.find((f) => f.id === id)
    if (formato) return { canal, formato }
  }
  return null
}
