import { ImageResponse } from "next/og"

import { cargarFuente } from "./fonts"
import { ALTO, ANCHO, type Estilo } from "./theme"

/**
 * Dos estilos alternativos para los carruseles de noticias, ademas del clasico.
 *
 *   - `editorial`: limpio, sobre blanco, inspirado en la publicidad de
 *     ElevenLabs. La foto en un bloque arriba, el nicho y un boton en una linea,
 *     el titular muy grande y el logo en el pie.
 *   - `impacto`: de medio informativo, con la estructura de las portadas de
 *     UHN. Foto a sangre, el sello de la marca al centro, una barra de color y
 *     el titular en mayusculas condensadas. El color secundario es verde.
 *
 * De la plantilla clasica se conserva lo que no se negocia: el titular de la
 * noticia y el indicador de su nicho. Satori solo entiende flexbox: todo div
 * con hijos lleva `display: flex`.
 */

export type PlantillaNoticia = "editorial" | "impacto"
export type ComposicionNoticia = "portada" | "texto" | "foto" | "cierre"

export type LaminaNoticia = {
  plantilla: PlantillaNoticia
  composicion: ComposicionNoticia
  titular: string
  cuerpo?: string | null
  /** El nicho de la noticia (tema o nicho del segmento). */
  nicho: string
  foto?: string | null
  /** El elemento recortado de la portada (un logo, una cara), si lo hay. */
  inserto?: string | null
  n: number
  total: number
  logoClaro?: string | null
  logoOscuro?: string | null
  estilo: Estilo
}

/** El verde de la marca cuando la paleta no trae un color propio. */
const VERDE = "#2BB673"

/** El acento: el de la paleta si es un color de verdad; si es gris o blanco, verde. */
function acentoDe(estilo: Estilo): string {
  const hex = estilo.paleta.acento.replace("#", "")
  if (hex.length !== 6) return VERDE
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(r, g, b) - Math.min(r, g, b) < 40 ? VERDE : estilo.paleta.acento
}

/** Sin las marcas de enfasis del guion: aqui no se resalta por palabras. */
const limpio = (t: string | null | undefined) => (t ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim()

/** El tamaño del titular segun su largo: que quepa siempre sin cortarse. */
function tamano(t: string, escala: [number, number][]): number {
  for (const [hasta, size] of escala) if (t.length <= hasta) return size
  return escala[escala.length - 1][1]
}

/** Recorte por palabra, por si el guion trae un parrafo donde iba un titular. */
function cortar(t: string, tope: number): string {
  if (t.length <= tope) return t
  const c = t.slice(0, tope)
  return `${c.slice(0, Math.max(c.lastIndexOf(" "), tope * 0.7)).replace(/[.,;:]$/, "")}…`
}

const pagina = (n: number, total: number) => `${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`

function Img({ src, style }: { src: string; style: React.CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} style={{ objectFit: "cover", ...style }} />
}

// ---------------------------------------------------------------- editorial

const ED = { fondo: "#FFFFFF", texto: "#0A0A0A", suave: "#6B6B6B", linea: "#E6E6E6", margen: 44 }

function NichoEditorial({ nicho, acento }: { nicho: string; acento: string }) {
  if (!nicho) return <div style={{ display: "flex" }} />
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", width: 14, height: 14, borderRadius: 14, background: acento }} />
      <div style={{ display: "flex", fontSize: 32, color: ED.texto, letterSpacing: -0.5 }}>{cortar(nicho, 34)}</div>
    </div>
  )
}

function PieEditorial({ l, logo }: { l: LaminaNoticia; logo: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
      <div style={{ display: "flex", fontSize: 22, color: ED.suave, maxWidth: 560 }}>
        {l.estilo.mostrarPaginacion && l.total > 1 ? pagina(l.n, l.total) : limpio(l.estilo.marca)}
      </div>
      {logo ? <Img src={logo} style={{ height: 52, width: 260, objectFit: "contain", objectPosition: "right" }} /> : <div style={{ display: "flex" }} />}
    </div>
  )
}

function Editorial(l: LaminaNoticia) {
  const acento = acentoDe(l.estilo)
  const logo = l.logoOscuro ?? l.logoClaro ?? null
  const titular = limpio(l.titular)
  const base: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: ANCHO,
    height: ALTO,
    background: ED.fondo,
    color: ED.texto,
    fontFamily: l.estilo.fuente,
    padding: ED.margen,
  }

  if (l.composicion === "portada") {
    const t = cortar(titular, 120)
    return (
      <div style={base}>
        {l.foto ? (
          <Img src={l.foto} style={{ width: ANCHO - ED.margen * 2, height: 700, borderRadius: 6 }} />
        ) : (
          <div style={{ display: "flex", width: ANCHO - ED.margen * 2, height: 700, background: "#F2F2F2", borderRadius: 6 }} />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40, paddingLeft: 6, paddingRight: 6 }}>
          <NichoEditorial nicho={l.nicho} acento={acento} />
          {l.total > 1 && l.estilo.mostrarPaginacion ? (
            <div style={{ display: "flex", background: ED.texto, color: "#FFFFFF", fontSize: 26, fontWeight: 600, padding: "16px 34px", borderRadius: 999 }}>
              Desliza →
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 26,
            paddingLeft: 4,
            fontSize: tamano(t, [[40, 104], [60, 88], [85, 74], [110, 64], [999, 58]]),
            lineHeight: 1.02,
            letterSpacing: -3,
            fontWeight: 400,
          }}
        >
          {t}
        </div>
        <PieEditorial l={l} logo={logo} />
      </div>
    )
  }

  if (l.composicion === "cierre") {
    return (
      <div style={{ ...base, alignItems: "flex-start", justifyContent: "center", padding: 96 }}>
        {logo ? <Img src={logo} style={{ height: 120, width: 520, objectFit: "contain", objectPosition: "left" }} /> : null}
        <div style={{ display: "flex", marginTop: 64, fontSize: 104, lineHeight: 1, letterSpacing: -3 }}>{cortar(titular, 40)}</div>
        {l.cuerpo ? (
          <div style={{ display: "flex", marginTop: 32, fontSize: 40, lineHeight: 1.3, color: ED.suave, maxWidth: 820 }}>{cortar(limpio(l.cuerpo), 160)}</div>
        ) : null}
        <div style={{ display: "flex", marginTop: 56, background: ED.texto, color: "#FFFFFF", fontSize: 30, fontWeight: 600, padding: "20px 44px", borderRadius: 999 }}>
          Seguir
        </div>
      </div>
    )
  }

  // Interior: con foto en bloque arriba o solo tipografia.
  const t = cortar(titular, 110)
  const cuerpo = cortar(limpio(l.cuerpo), l.foto ? 230 : 420)
  return (
    <div style={base}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 6, paddingRight: 6, marginBottom: 36 }}>
        <NichoEditorial nicho={l.nicho} acento={acento} />
        <div style={{ display: "flex", fontSize: 22, color: ED.suave }}>{l.estilo.mostrarPaginacion ? pagina(l.n, l.total) : ""}</div>
      </div>
      {l.composicion === "foto" && l.foto ? (
        <Img src={l.foto} style={{ width: ANCHO - ED.margen * 2, height: 520, borderRadius: 6, marginBottom: 44 }} />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", ...(l.composicion === "foto" && l.foto ? {} : { flex: 1 }), paddingLeft: 6, paddingRight: 6, paddingBottom: l.composicion === "foto" && l.foto ? 0 : 60 }}>
        <div style={{ display: "flex", fontSize: l.composicion === "foto" && l.foto ? tamano(t, [[45, 76], [75, 64], [999, 56]]) : tamano(t, [[45, 96], [75, 82], [999, 70]]), lineHeight: 1.04, letterSpacing: -2 }}>{t}</div>
        {cuerpo ? <div style={{ display: "flex", marginTop: 34, fontSize: l.foto ? 36 : 42, lineHeight: 1.35, color: ED.suave }}>{cuerpo}</div> : null}
      </div>
      <PieEditorial l={l} logo={logo} />
    </div>
  )
}

// ------------------------------------------------------------------ impacto

const IM = { fondo: "#0B0B0B", texto: "#FFFFFF", suave: "#CFCFCF", titulo: "Oswald" }

/** El sello de la marca: el logo claro sobre un bloque del color de acento (apaisado: casi todos los logos lo son). */
function Sello({ logo, acento, lado }: { logo: string | null; acento: string; lado: number }) {
  if (!logo) return null
  const ancho = lado * 2.3
  return (
    <div style={{ display: "flex", width: ancho, height: lado, borderRadius: lado * 0.2, background: acento, alignItems: "center", justifyContent: "center" }}>
      <Img src={logo} style={{ width: ancho * 0.8, height: lado * 0.62, objectFit: "contain" }} />
    </div>
  )
}

function NichoImpacto({ nicho, acento }: { nicho: string; acento: string }) {
  if (!nicho) return null
  return (
    <div style={{ display: "flex", fontFamily: IM.titulo, fontSize: 28, fontWeight: 500, letterSpacing: 5, textTransform: "uppercase", color: acento }}>
      {cortar(nicho, 34)}
    </div>
  )
}

function Impacto(l: LaminaNoticia) {
  const acento = acentoDe(l.estilo)
  const logo = l.logoClaro ?? l.logoOscuro ?? null
  const titular = limpio(l.titular)
  const base: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    width: ANCHO,
    height: ALTO,
    background: IM.fondo,
    color: IM.texto,
    fontFamily: l.estilo.fuente,
  }
  const paginaArriba =
    l.estilo.mostrarPaginacion && l.total > 1 ? (
      <div style={{ display: "flex", position: "absolute", top: 56, right: 64, fontFamily: IM.titulo, fontSize: 28, fontWeight: 500, letterSpacing: 2, color: IM.texto }}>
        {pagina(l.n, l.total)}
      </div>
    ) : null

  if (l.composicion === "portada") {
    const t = cortar(titular.toUpperCase(), 110)
    return (
      <div style={base}>
        {l.foto ? <Img src={l.foto} style={{ position: "absolute", top: 0, left: 0, width: ANCHO, height: ALTO }} /> : null}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ANCHO,
            height: ALTO,
            backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.82) 62%, rgba(0,0,0,0.97) 100%)",
          }}
        />
        {l.inserto ? (
          <div style={{ display: "flex", position: "absolute", top: 72, left: 64, width: 330, height: 330, borderRadius: 330, border: `8px solid ${IM.texto}`, background: "#FFFFFF" }}>
            <Img src={l.inserto} style={{ width: 314, height: 314, borderRadius: 314 }} />
          </div>
        ) : null}
        {paginaArriba}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", padding: "0 70px 84px" }}>
          <Sello logo={logo} acento={acento} lado={100} />
          <div style={{ display: "flex", marginTop: logo ? 30 : 0 }}>
            <NichoImpacto nicho={l.nicho} acento={acento} />
          </div>
          <div style={{ display: "flex", width: 420, height: 7, background: acento, marginTop: 22, marginBottom: 30 }} />
          <div
            style={{
              display: "flex",
              textAlign: "center",
              justifyContent: "center",
              fontFamily: IM.titulo,
              fontWeight: 700,
              fontSize: tamano(t, [[45, 84], [70, 72], [95, 64], [999, 58]]),
              lineHeight: 1.12,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </div>
        </div>
      </div>
    )
  }

  if (l.composicion === "cierre") {
    return (
      <div style={{ ...base, alignItems: "center", justifyContent: "center", padding: 90 }}>
        <Sello logo={logo} acento={acento} lado={170} />
        <div style={{ display: "flex", width: 420, height: 7, background: acento, marginTop: 56, marginBottom: 44 }} />
        <div style={{ display: "flex", fontFamily: IM.titulo, fontWeight: 700, fontSize: 92, textTransform: "uppercase", textAlign: "center", lineHeight: 1.05 }}>
          {cortar(titular, 40)}
        </div>
        {l.cuerpo ? (
          <div style={{ display: "flex", marginTop: 30, fontSize: 38, lineHeight: 1.35, color: IM.suave, textAlign: "center", maxWidth: 820 }}>{cortar(limpio(l.cuerpo), 160)}</div>
        ) : null}
      </div>
    )
  }

  // Interior: foto arriba fundida en negro, o solo tipografia sobre negro.
  const t = cortar(titular.toUpperCase(), 100)
  const cuerpo = cortar(limpio(l.cuerpo), l.foto ? 240 : 420)
  const conFoto = l.composicion === "foto" && l.foto
  return (
    <div style={base}>
      {conFoto ? (
        <>
          <Img src={l.foto!} style={{ position: "absolute", top: 0, left: 0, width: ANCHO, height: 720 }} />
          <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: ANCHO, height: 722, backgroundImage: "linear-gradient(180deg, rgba(11,11,11,0.25) 0%, rgba(11,11,11,0) 30%, rgba(11,11,11,0.6) 75%, #0B0B0B 100%)" }} />
        </>
      ) : null}
      {paginaArriba}
      <div style={{ display: "flex", flexDirection: "column", padding: conFoto ? "0 84px 96px" : "0 84px", ...(conFoto ? { marginTop: "auto" } : { flex: 1 }), justifyContent: "center" }}>
        <NichoImpacto nicho={l.nicho} acento={acento} />
        <div style={{ display: "flex", width: 140, height: 7, background: acento, marginTop: 20, marginBottom: 28 }} />
        <div style={{ display: "flex", fontFamily: IM.titulo, fontWeight: 700, fontSize: conFoto ? tamano(t, [[45, 76], [75, 64], [999, 56]]) : tamano(t, [[45, 92], [75, 80], [999, 68]]), lineHeight: 1.1 }}>{t}</div>
        {cuerpo ? <div style={{ display: "flex", marginTop: 28, fontSize: conFoto ? 36 : 40, lineHeight: 1.4, color: IM.suave }}>{cuerpo}</div> : null}
        {logo && !conFoto ? (
          <div style={{ display: "flex", marginTop: 56 }}>
            <Sello logo={logo} acento={acento} lado={70} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- render

export async function renderNoticia(l: LaminaNoticia): Promise<Buffer> {
  const fuentes = await cargarFuente(l.estilo.fuente)
  const extra = l.plantilla === "impacto" ? await cargarFuente("Oswald") : []
  const respuesta = new ImageResponse(l.plantilla === "editorial" ? <Editorial {...l} /> : <Impacto {...l} />, {
    width: ANCHO,
    height: ALTO,
    fonts: [...fuentes, ...extra],
  })
  return Buffer.from(await respuesta.arrayBuffer())
}

/** Que composicion lleva cada lamina interior: alterna foto y tipografia. */
export function repartirNoticia(interiores: number, conFotos: boolean): ComposicionNoticia[] {
  return Array.from({ length: interiores }, (_, i) => (conFotos && i % 2 === 0 ? "foto" : "texto"))
}
