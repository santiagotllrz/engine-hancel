import { ESCALA, LIENZO, MARGEN, type Estilo } from "./theme"

/**
 * Las plantillas del carrusel.
 *
 * Se dibujan con Satori (via next/og), que entiende un subconjunto de CSS: hay
 * flexbox pero no grid, y todo div con varios hijos necesita `display: flex`
 * explicito. De ahi que los estilos vayan en linea y sin clases.
 *
 * Las dos comparten marco —marca arriba, numero de slide abajo, mismos
 * margenes— para que el carrusel se lea como una pieza y no como laminas
 * sueltas.
 */

export type SlideTexto = {
  n: number
  type: "text"
  title?: string | null
  body?: string | null
}

export type SlidePortada = {
  n: number
  type: "photo_hook"
  hook?: string | null
}

export type Slide = SlideTexto | SlidePortada

/**
 * Encoge la tipografia cuando el texto es largo.
 *
 * Satori no ajusta el texto al hueco: si no cabe, lo desborda y lo recorta. Con
 * esto un hook corto se ve enorme y uno largo sigue cabiendo.
 */
function tamanoSegunLargo(texto: string, grande: number, pequeno: number): number {
  const largo = texto.length
  if (largo <= 60) return grande
  if (largo <= 110) return Math.round((grande + pequeno) / 2)
  if (largo <= 180) return pequeno
  return Math.round(pequeno * 0.82)
}

function Marco({
  estilo,
  numero,
  total,
  children,
  fondo,
}: {
  estilo: Estilo
  numero: number
  total: number
  children: React.ReactNode
  fondo: string
}) {
  const { paleta, fuente } = estilo

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: LIENZO,
        height: LIENZO,
        padding: MARGEN,
        background: fondo,
        fontFamily: fuente,
        color: paleta.texto,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 14,
            background: paleta.acento,
            marginRight: 16,
          }}
        />
        <div
          style={{
            fontSize: ESCALA.numero,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: paleta.textoSuave,
          }}
        >
          Hancel
        </div>
      </div>

      {children}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: ESCALA.numero,
          color: paleta.textoSuave,
        }}
      >
        <div style={{ display: "flex" }}>
          {numero} / {total}
        </div>
        {numero < total ? (
          <div style={{ display: "flex", fontWeight: 600, color: paleta.acento }}>desliza →</div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
      </div>
    </div>
  )
}

/**
 * Portada: la foto de la noticia al fondo, con un velo para que el hook se lea.
 *
 * `foto` es un data URI y no una URL remota a proposito: descargandola antes se
 * puede decidir que hacer si falla, en vez de que reviente el render entero.
 */
export function Portada({
  slide,
  total,
  estilo,
  foto,
}: {
  slide: SlidePortada
  total: number
  estilo: Estilo
  foto: string | null
}) {
  const { paleta } = estilo
  const hook = (slide.hook ?? "").trim()
  const tamano = tamanoSegunLargo(hook, ESCALA.hookCorto, ESCALA.hook)

  return (
    <div style={{ display: "flex", width: LIENZO, height: LIENZO, position: "relative" }}>
      {foto ? (
        // Satori dibuja un subconjunto de HTML y no conoce next/image; ademas
        // esto no acaba en un navegador, sino en un PNG, asi que ni la
        // optimizacion ni el alt tienen a quien servir.
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={foto}
          width={LIENZO}
          height={LIENZO}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: LIENZO,
            height: LIENZO,
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* El velo va siempre: incluso sobre el fondo liso da profundidad. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: LIENZO,
          height: LIENZO,
          background: foto ? paleta.velo : paleta.fondo,
        }}
      />

      <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent">
          <div
            style={{
              display: "flex",
              fontSize: tamano,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: LIENZO - MARGEN * 2,
            }}
          >
            {hook}
          </div>
        </Marco>
      </div>
    </div>
  )
}

/** Lamina de texto: titulo y cuerpo, sin foto. */
export function Lamina({
  slide,
  total,
  estilo,
}: {
  slide: SlideTexto
  total: number
  estilo: Estilo
}) {
  const { paleta } = estilo
  const titulo = (slide.title ?? "").trim()
  const cuerpo = (slide.body ?? "").trim()

  // Alterna el fondo entre laminas para que pasar el dedo se note.
  const fondo = slide.n % 2 === 0 ? paleta.fondo : paleta.fondoAlterno

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={fondo}>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: LIENZO - MARGEN * 2 }}>
        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: tamanoSegunLargo(titulo, ESCALA.titulo, 52),
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1,
              marginBottom: cuerpo ? 32 : 0,
            }}
          >
            {titulo}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: tamanoSegunLargo(cuerpo, ESCALA.cuerpo, 36),
              fontWeight: 400,
              lineHeight: 1.42,
              color: titulo ? paleta.textoSuave : paleta.texto,
            }}
          >
            {cuerpo}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}
