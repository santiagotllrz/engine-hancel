import { ALTO, ANCHO, ESCALA, MARGEN, TOPES, type Estilo, type Variante } from "./theme"

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
 *
 * Lo que no cambia entre composiciones es el marco: el mismo aire por los cuatro
 * lados, la marca siempre en el mismo sitio y la paginacion siempre a la misma
 * altura. Es lo que las convierte en una serie en vez de en ocho posts pegados.
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
  /**
   * Antetitulo de la portada: el tema de la noticia, en versalitas sobre el
   * hook. Es el hueco que en las cuentas que funcionan lleva la seccion, y sirve
   * para situar de que va el post antes de leer el titular.
   */
  etiqueta?: string | null
}

/** El ancho util: el lienzo menos el marco. Ninguna lamina se sale de aqui. */
const UTIL = ANCHO - MARGEN * 2

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
  // La foto va a color aunque la paleta sea monocroma. El blanco y negro es del
  // sistema —fondo, tipografia, elementos graficos—, no de la fotografia:
  // desaturarla le quitaba justo lo que hace que el pulgar se pare, y una serie
  // se reconoce igual de bien por la tipografia y el negro.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} style={{ objectFit: "cover", ...estilo }} />
}

/**
 * Funde la foto en el fondo de la paleta.
 *
 * Un velo plano sobre toda la foto la apaga entera para poder leer cuatro
 * palabras. El degradado deja la mitad de arriba limpia y solo se vuelve solido
 * donde va el texto, que es lo que hace legible un titular grande sin renunciar
 * a la imagen.
 */
function Fundido({
  estilo,
  ancho,
  alto,
  desde = 32,
}: {
  estilo: Estilo
  ancho: number
  alto: number
  /** A que altura, en porcentaje, empieza a oscurecer. */
  desde?: number
}) {
  const [claro, medio, solido] = estilo.paleta.fundido

  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: ancho, height: alto }}>
      {/* Banda de arriba: sostiene la marca cuando la foto tiene un cielo claro. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          backgroundImage: `linear-gradient(180deg, ${estilo.paleta.veloTecho} 0%, ${claro} 24%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          backgroundImage: `linear-gradient(180deg, ${claro} ${desde}%, ${medio} ${Math.min(
            desde + 42,
            94
          )}%, ${solido} 100%)`,
        }}
      />
    </div>
  )
}

/**
 * Cabecera y pie comunes: es lo que hace que las laminas sean una serie.
 *
 * `alinear` decide donde cae el contenido dentro del marco: centrado en las
 * laminas interiores y abajo en la portada, que es donde va el hook.
 */
function Marco({
  estilo,
  numero,
  total,
  children,
  fondo,
  sobreFoto = false,
  alinear = "centro",
}: {
  estilo: Estilo
  numero: number
  total: number
  children: React.ReactNode
  fondo: string
  sobreFoto?: boolean
  alinear?: "centro" | "abajo"
}) {
  const { paleta, fuente, marca, mostrarPaginacion } = estilo
  const abajo = alinear === "abajo"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: ANCHO,
        height: ALTO,
        padding: MARGEN,
        background: fondo,
        fontFamily: fuente,
        color: paleta.texto,
      }}
    >
      {marca ? (
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

      {/* Los dos huecos elasticos colocan el contenido sin tocar el marco. */}
      <div style={{ display: "flex", flex: 1 }} />
      {children}
      <div style={{ display: "flex", flex: abajo ? 0 : 1 }} />

      {mostrarPaginacion ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 48,
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

/**
 * Portada: foto a sangre arriba y el titular abajo.
 *
 * Es la composicion de las cuentas que funcionan, y el motivo es que las dos
 * cosas que tienen que pasar en el feed pasan en sitios distintos. La foto, a
 * color y sin nada encima en su mitad de arriba, es lo que frena el pulgar; el
 * titular, abajo y sobre fondo solido, es lo que hace deslizar. Ponerlos
 * mezclados —texto grande cruzando la foto— arruina las dos: ni se ve la imagen
 * ni se lee bien el texto.
 *
 * El antetitulo en versalitas cierra el patron: dice de que va antes de que
 * nadie lea el titular.
 */
function Portada({ slide, total, estilo, foto, etiqueta }: LaminaProps) {
  const { paleta } = estilo
  const hook = slide.type === "photo_hook" ? (slide.hook ?? "").trim() : ""
  const antetitulo = (etiqueta ?? "").trim()

  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ANCHO,
            height: ALTO,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Desde el 30%: deja limpia la mitad superior, que es la que atrae. */}
      <Fundido estilo={estilo} ancho={ANCHO} alto={ALTO} desde={30} />

      <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent" sobreFoto alinear="abajo">
          <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
            {antetitulo ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 26,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 52,
                    height: 5,
                    borderRadius: 5,
                    background: paleta.acento,
                    marginRight: 20,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: ESCALA.antetitulo,
                    fontWeight: 600,
                    letterSpacing: 5,
                    textTransform: "uppercase",
                    color: paleta.texto,
                  }}
                >
                  {recortar(antetitulo, TOPES.antetitulo)}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                fontSize: ESCALA.hook,
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: -2,
                width: UTIL,
              }}
            >
              {recortar(hook, TOPES.hook)}
            </div>
          </div>
        </Marco>
      </div>
    </div>
  )
}

/** Texto sobre una foto a sangre, para las laminas interiores. */
function SobreFoto({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""

  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ANCHO,
            height: ALTO,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Mas bajo que en la portada: aqui manda el texto, no la imagen. */}
      <Fundido estilo={estilo} ancho={ANCHO} alto={ALTO} desde={14} />

      <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent" sobreFoto alinear="abajo">
          <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
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
              <div style={{ display: "flex", fontSize: ESCALA.cuerpo, lineHeight: 1.4 }}>
                {recortar(cuerpo, TOPES.cuerpoAjustado)}
              </div>
            ) : null}
          </div>
        </Marco>
      </div>
    </div>
  )
}

/**
 * Foto arriba y texto debajo, las dos dentro del marco.
 *
 * La foto va recuadrada y no a sangre a proposito: en esta composicion es
 * contenido, no fondo, y sacarla al borde rompia el unico eje que comparten
 * todas las laminas.
 */
function FotoLateral({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const altoFoto = Math.round(ALTO * 0.34)

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondo}>
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        {foto ? (
          <Foto src={foto} width={UTIL} height={altoFoto} borderRadius={18} />
        ) : (
          <div
            style={{
              display: "flex",
              width: UTIL,
              height: altoFoto,
              borderRadius: 18,
              background: paleta.fondoAlterno,
            }}
          />
        )}

        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginTop: 44,
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
              marginTop: titulo ? 0 : 44,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAjustado)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/** Foto en recuadro bajo, con aire alrededor: la mas tranquila de las tres con foto. */
function FotoRecuadro({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const altoFoto = Math.round(ALTO * 0.24)

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondoAlterno}>
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        {foto ? <Foto src={foto} width={UTIL} height={altoFoto} borderRadius={20} /> : null}

        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginTop: foto ? 40 : 0,
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
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
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
      <div style={{ display: "flex", alignItems: "flex-start", width: UTIL }}>
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
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
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
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ANCHO,
          height: ALTO,
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
          width: ANCHO,
          height: ALTO,
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
 * mismo lenguaje que la portada del carrusel: foto a color arriba, degradado, y
 * el titular abajo sobre fondo solido. Que las dos redes compartan tratamiento
 * es lo que hace que se reconozcan como la misma cuenta.
 */
export function TarjetaLinkedin({
  titular,
  estilo,
  foto,
  ancho,
  alto,
  etiqueta,
}: {
  titular: string
  estilo: Estilo
  foto: string | null
  ancho: number
  alto: number
  etiqueta?: string | null
}) {
  const { paleta, marca } = estilo
  const antetitulo = (etiqueta ?? "").trim()
  const margen = 72
  const util = ancho - margen * 2
  const tamano = titular.length <= 70 ? 62 : titular.length <= 130 ? 50 : 42

  return (
    <div style={{ display: "flex", width: ancho, height: alto, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ancho} height={alto} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ancho,
            height: alto,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Apaisada y con menos alto: el degradado tiene que arrancar desde arriba
          o el titular, que ocupa la mitad de abajo, se queda sobre la foto. */}
      <Fundido estilo={estilo} ancho={ancho} alto={alto} desde={0} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          padding: margen,
          fontFamily: estilo.fuente,
          color: paleta.texto,
        }}
      >
        {antetitulo ? (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
            <div
              style={{
                display: "flex",
                width: 46,
                height: 5,
                borderRadius: 5,
                background: paleta.acento,
                marginRight: 18,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: paleta.texto,
              }}
            >
              {recortar(antetitulo, TOPES.antetitulo)}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            fontSize: tamano,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.2,
            width: util,
          }}
        >
          {titular}
        </div>

        {marca ? (
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: paleta.textoSuave,
            }}
          >
            {marca}
          </div>
        ) : null}
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
      return <Portada {...props} />
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
