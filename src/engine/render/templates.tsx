import { ESCALA, LIENZO, MARGEN, TOPES, type Estilo, type Variante } from "./theme"

/**
 * Las laminas del carrusel.
 *
 * Se dibujan con Satori (via next/og), que entiende un subconjunto de CSS: hay
 * flexbox pero no grid, y todo div con varios hijos necesita `display: flex`
 * explicito. De ahi que los estilos vayan en linea y sin clases.
 *
 * Hay varias composiciones a proposito. Cinco laminas identicas con la foto
 * detras se leen como un formulario; alternar el peso del texto, el sitio de la
 * foto y algun elemento grafico es lo que hace que el carrusel se recorra.
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

/** Lo que necesita una lamina para dibujarse. */
export type LaminaProps = {
  slide: Slide
  total: number
  estilo: Estilo
  variante: Variante
  /** Data URI ya descargado, o null. */
  foto: string | null
}

/**
 * Recorta por palabra y cierra con puntos suspensivos.
 *
 * Los tamaños de letra son fijos para que el carrusel se lea parejo, asi que lo
 * que no cabe hay que quitarlo: Satori no ajusta el texto al hueco, lo desborda
 * y lo corta contra el borde a media palabra.
 */
function recortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto

  const cortado = texto.slice(0, tope)
  const ultimoEspacio = cortado.lastIndexOf(" ")
  const limpio = (ultimoEspacio > tope * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()

  return `${limpio.replace(/[.,;:]$/, "")}…`
}

function Foto({ src, ...estilo }: { src: string } & React.CSSProperties) {
  // Satori dibuja un subconjunto de HTML y no conoce next/image; ademas esto no
  // acaba en un navegador sino en un PNG, asi que ni la optimizacion ni el alt
  // tienen a quien servir.
  // Desaturada: las fotos del banco vienen a color y una dominante azul o
  // naranja rompe la serie monocroma. En blanco y negro la foto aporta textura
  // sin discutirle el protagonismo al texto.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} style={{ objectFit: "cover", filter: "grayscale(1)", ...estilo }} />
}

/** Cabecera y pie comunes: es lo que hace que las laminas sean una serie. */
function Marco({
  estilo,
  numero,
  total,
  children,
  fondo,
  sobreFoto = false,
}: {
  estilo: Estilo
  numero: number
  total: number
  children: React.ReactNode
  fondo: string
  sobreFoto?: boolean
}) {
  const { paleta, fuente, marca, mostrarPaginacion } = estilo
  const hayCabecera = marca.length > 0

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
      {hayCabecera ? (
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
              color: sobreFoto ? paleta.texto : paleta.textoSuave,
            }}
          >
            {marca}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", height: 14 }} />
      )}

      {children}

      {mostrarPaginacion ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: ESCALA.numero,
            color: sobreFoto ? paleta.texto : paleta.textoSuave,
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
      ) : (
        <div style={{ display: "flex", height: 14 }} />
      )}
    </div>
  )
}

/** Texto sobre una foto a sangre. Es la composicion de la portada. */
function SobreFoto({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const texto =
    slide.type === "photo_hook"
      ? (slide.hook ?? "").trim()
      : [slide.title, slide.body].filter(Boolean).join("\n").trim()

  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""

  return (
    <div style={{ display: "flex", width: LIENZO, height: LIENZO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={LIENZO} height={LIENZO} />
      ) : null}

      {/* El velo va siempre: sobre el fondo liso tambien da profundidad. */}
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
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent" sobreFoto>
          {slide.type === "photo_hook" ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.hook,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: -1.5,
                maxWidth: LIENZO - MARGEN * 2,
              }}
            >
              {recortar(texto, TOPES.hook)}
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", maxWidth: LIENZO - MARGEN * 2 }}
            >
              {titulo ? (
                <div
                  style={{
                    display: "flex",
                    fontSize: ESCALA.titulo,
                    fontWeight: 700,
                    lineHeight: 1.12,
                    letterSpacing: -1,
                    marginBottom: cuerpo ? 28 : 0,
                  }}
                >
                  {recortar(titulo, TOPES.titulo)}
                </div>
              ) : null}
              {cuerpo ? (
                <div
                  style={{
                    display: "flex",
                    fontSize: ESCALA.cuerpo,
                    lineHeight: 1.4,
                  }}
                >
                  {recortar(cuerpo, TOPES.cuerpoAmplio)}
                </div>
              ) : null}
            </div>
          )}
        </Marco>
      </div>
    </div>
  )
}

/** Foto arriba a sangre y texto debajo: rompe el bloque sin tapar la imagen. */
function FotoLateral({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const altoFoto = Math.round(LIENZO * 0.42)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: LIENZO,
        height: LIENZO,
        background: paleta.fondo,
        fontFamily: estilo.fuente,
        color: paleta.texto,
      }}
    >
      {foto ? (
        <Foto src={foto} width={LIENZO} height={altoFoto} />
      ) : (
        <div style={{ display: "flex", width: LIENZO, height: altoFoto, background: paleta.fondoAlterno }} />
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: MARGEN,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {titulo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.titulo,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: -1,
                marginBottom: cuerpo ? 24 : 0,
              }}
            >
              {recortar(titulo, TOPES.titulo)}
            </div>
          ) : null}
          {cuerpo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.cuerpo,
                lineHeight: 1.4,
                color: paleta.textoSuave,
              }}
            >
              {recortar(cuerpo, TOPES.cuerpoAjustado)}
            </div>
          ) : null}
        </div>

        {estilo.mostrarPaginacion ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: ESCALA.numero,
              color: paleta.textoSuave,
            }}
          >
            <div style={{ display: "flex" }}>
              {slide.n} / {total}
            </div>
            {slide.n < total ? (
              <div style={{ display: "flex", fontWeight: 600, color: paleta.acento }}>
                desliza →
              </div>
            ) : (
              <div style={{ display: "flex" }} />
            )}
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
      </div>
    </div>
  )
}

/** Foto en recuadro, con aire alrededor: la mas tranquila de las tres con foto. */
function FotoRecuadro({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const lado = Math.round(LIENZO - MARGEN * 2)
  const altoFoto = Math.round(LIENZO * 0.3)

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondoAlterno}>
      <div style={{ display: "flex", flexDirection: "column", width: lado }}>
        {foto ? (
          <Foto src={foto} width={lado} height={altoFoto} borderRadius={20} />
        ) : null}

        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginTop: foto ? 36 : 0,
              marginBottom: cuerpo ? 20 : 0,
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.cuerpo,
              lineHeight: 1.42,
              color: paleta.textoSuave,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAjustado)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Cita: el cuerpo en grande y centrado, con una barra de acento.
 *
 * Para las laminas cuyo peso esta en una frase, no en una explicacion.
 */
function Cita({ slide, total, estilo }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const frase = cuerpo || titulo

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondo}>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: LIENZO - MARGEN * 2 }}>
        <div
          style={{
            display: "flex",
            width: 96,
            height: 8,
            borderRadius: 8,
            background: paleta.acento,
            marginBottom: 40,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: ESCALA.cita,
            fontWeight: 600,
            lineHeight: 1.24,
            letterSpacing: -0.8,
          }}
        >
          {recortar(frase, TOPES.cita)}
        </div>
        {cuerpo && titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.etiqueta,
              marginTop: 32,
              color: paleta.textoSuave,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Dato: el numero de lamina enorme como elemento grafico.
 *
 * Da ritmo sin necesitar foto, que es util cuando el banco no devuelve nada.
 */
function Dato({ slide, total, estilo }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondo}>
      <div style={{ display: "flex", alignItems: "flex-start", maxWidth: LIENZO - MARGEN * 2 }}>
        <div
          style={{
            display: "flex",
            fontSize: 190,
            fontWeight: 700,
            lineHeight: 0.82,
            color: paleta.acento,
            opacity: 0.32,
            marginRight: 36,
          }}
        >
          {String(slide.n).padStart(2, "0")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {titulo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.titulo,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: -1,
                marginBottom: cuerpo ? 22 : 0,
              }}
            >
              {recortar(titulo, TOPES.titulo)}
            </div>
          ) : null}
          {cuerpo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.cuerpo,
                lineHeight: 1.42,
                color: paleta.textoSuave,
              }}
            >
              {recortar(cuerpo, TOPES.cuerpoAjustado)}
            </div>
          ) : null}
        </div>
      </div>
    </Marco>
  )
}

/** Lamina de texto sin adornos: la mas sobria, para dar respiro entre las demas. */
function Lamina({ slide, total, estilo }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const fondo = slide.n % 2 === 0 ? paleta.fondo : paleta.fondoAlterno

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={fondo}>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: LIENZO - MARGEN * 2 }}>
        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1,
              marginBottom: cuerpo ? 32 : 0,
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.cuerpo,
              lineHeight: 1.42,
              color: titulo ? paleta.textoSuave : paleta.texto,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAmplio)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Cierre: la invitacion a seguir la cuenta.
 *
 * Centrada y sin paginacion, para que se lea como el final y no como una lamina
 * mas. La foto va muy velada: aqui la imagen es fondo, no contenido.
 */
export function Cierre({ estilo, foto }: { estilo: Estilo; foto: string | null }) {
  const { paleta, marca, cierre } = estilo

  return (
    <div style={{ display: "flex", width: LIENZO, height: LIENZO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={LIENZO} height={LIENZO} />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: LIENZO,
          height: LIENZO,
          // El velo de la paleta, reforzado: aqui el texto va centrado y sin
          // bloque detras, asi que necesita el fondo mas tranquilo que el resto.
          background: foto ? paleta.veloFuerte : paleta.fondo,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          top: 0,
          left: 0,
          width: LIENZO,
          height: LIENZO,
          padding: MARGEN,
          fontFamily: estilo.fuente,
          color: paleta.texto,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 72,
            height: 72,
            borderRadius: 72,
            background: paleta.acento,
            marginBottom: 48,
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            marginBottom: 28,
          }}
        >
          {cierre.titulo}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 40,
            lineHeight: 1.38,
            color: paleta.textoSuave,
            maxWidth: 760,
          }}
        >
          {cierre.texto}
        </div>

        {marca ? (
          <div
            style={{
              display: "flex",
              marginTop: 64,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: paleta.acento,
            }}
          >
            {marca}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * La imagen que acompaña a un post de LinkedIn.
 *
 * Formato apaisado, que es el que LinkedIn muestra sin recortar en el feed, y el
 * mismo lenguaje que el carrusel: foto velada y titular encima.
 */
export function TarjetaLinkedin({
  titular,
  estilo,
  foto,
  ancho,
  alto,
}: {
  titular: string
  estilo: Estilo
  foto: string | null
  ancho: number
  alto: number
}) {
  const { paleta, marca } = estilo
  const tamano = titular.length <= 70 ? 66 : titular.length <= 130 ? 54 : 44

  return (
    <div style={{ display: "flex", width: ancho, height: alto, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ancho} height={alto} />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          background: foto ? paleta.veloFuerte : paleta.fondo,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          padding: 72,
          fontFamily: estilo.fuente,
          color: paleta.texto,
        }}
      >
        <div style={{ display: "flex", width: 84, height: 8, borderRadius: 8, background: paleta.acento }} />

        <div
          style={{
            display: "flex",
            fontSize: tamano,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.2,
            maxWidth: ancho - 144,
          }}
        >
          {titular}
        </div>

        {marca ? (
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: paleta.textoSuave,
            }}
          >
            {marca}
          </div>
        ) : (
          <div style={{ display: "flex", height: 8 }} />
        )}
      </div>
    </div>
  )
}

/** Elige la composicion. Si pide foto y no hay, cae a una que no la necesita. */
export function Composicion(props: LaminaProps) {
  const { variante, foto } = props

  switch (variante) {
    case "cierre":
      return <Cierre estilo={props.estilo} foto={foto} />
    case "portada":
    case "foto_fondo":
      return <SobreFoto {...props} />
    case "foto_lateral":
      return foto ? <FotoLateral {...props} /> : <Dato {...props} />
    case "foto_recuadro":
      return foto ? <FotoRecuadro {...props} /> : <Cita {...props} />
    case "cita":
      return <Cita {...props} />
    case "dato":
      return <Dato {...props} />
    default:
      return <Lamina {...props} />
  }
}
