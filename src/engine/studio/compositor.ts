import type { EstiloPlantilla, TipoEstilo } from "@/lib/plantillas-catalogo"

/**
 * El compositor: escribe cada pieza como HTML siguiendo su estilo.
 *
 * Canva importa ese HTML y lo convierte en un diseno editable (cada texto un
 * elemento de texto, cada imagen un hueco, cada bloque una forma). Por eso el
 * texto lo controla siempre el sistema, con su tipografia y sus tildes, y el
 * estilo sale igual en todas las piezas: lo deciden estas reglas, no un
 * generador que interpreta a su manera.
 *
 * Restricciones de la importacion, comprobadas: los bloques (div) con fondo y
 * borde redondeado se importan como formas; el SVG en linea no se importa. Por
 * eso los graficos se construyen con bloques, no con SVG.
 *
 * Todo se mide sobre un lienzo de 1080 de ancho y se escala (k) al tamano real
 * del formato. Los apaisados (mas anchos que altos) usan composiciones en dos
 * columnas.
 */

export type Grafico = {
  tipo: "barras" | "columnas" | "ranking" | "cifras"
  unidad: string
  items: {
    etiqueta: string
    valor: number | string
    variacion?: "sube" | "baja" | "estable"
    nota?: string
    /** El icono pedido (en ingles) y su url ya resuelta. */
    icono?: string
    iconoUrl?: string
  }[]
  destacado?: number
}

/**
 * Un apoyo del estilo Fotografico, dentro de la columna de texto: solo los que
 * informan. "lista" numerada, "cifra" con su explicacion, "datos" en pastillas.
 */
export type Recurso = {
  tipo: "cifra" | "lista" | "datos"
  valor?: string
  texto?: string
  items?: string[]
}

export type LaminaCompuesta = {
  rol: "portada" | "contenido" | "cierre" | "unica"
  /** Fotografico: la palabra o frase corta que encabeza ("PASO 02", "EL ERROR"). */
  antetitulo: string
  titulo: string
  cuerpo: string
  etiquetas: string[]
  grafico: Grafico | null
  fuente: string
  periodo: string
  /** La imagen principal: foto (Fotografico), dibujo o render generado. */
  imagen: string | null
  /** Una foto real de apoyo: la que acompana al dibujo o al grafico. */
  foto: string | null
  recurso: Recurso | null
  /** Data-viz: la url del icono de la lamina. */
  icono: string | null
  /** Infografia: como se organizan las etiquetas sobre la imagen. */
  esquema: "partes" | "pasos"
  /** Infografia: donde esta en la imagen la parte de cada etiqueta (0 a 1), o null. */
  puntos: ({ x: number; y: number } | null)[]
  /** Ancho / alto de la imagen generada, para que su caja la respete y los puntos caigan en su sitio. */
  aspecto: number | null
}

type Ctx = {
  W: number
  H: number
  k: number
  m: number
  apaisado: boolean
  e: EstiloPlantilla
  logo: string | null
  oscuro: boolean
}

// ------------------------------------------------------------------ piezas

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const px = (n: number) => `${Math.round(n)}px`

/**
 * Un texto, con las lineas partidas por el sistema.
 *
 * Canva parte las lineas del HTML con una fuente de respaldo mas estrecha y
 * despues las pinta en la tipografia del estilo, que es mas ancha: un titular
 * partido por el se sale de la lamina por la derecha. Por eso las lineas se
 * parten aqui, con un ancho de caracter que sobra, y van con <br>. La caja
 * lleva ademas un alto de sobra, porque Canva esconde lo que no cabe.
 */
function texto(t: string, x: number, y: number, ancho: number, s: string) {
  if (!t.trim()) return ""
  const base = Number(/font-size:(\d+)px/.exec(s)?.[1] ?? 32)
  const lh = Number(/line-height:([\d.]+)/.exec(s)?.[1] ?? 1.3)
  const peso = /font-weight:(7|8)00/.test(s) ? PESO_GRUESO : PESO_NORMAL
  // Red contra desbordes: la caja no pasa del borde del lienzo, una palabra que
  // no cabe en su linea encoge el texto, y un texto que se sale por abajo
  // tambien encoge (hasta el 60 %). Las composiciones ya miden; esto es lo que
  // impide que un caso que no midieron bien llegue a la pieza.
  const borde = 20 * (LIENZO.W / 1080)
  ancho = Math.max(40, Math.min(ancho, LIENZO.W - borde - x))
  const palabraMasLarga = Math.max(...t.trim().split(/\s+/).map((p) => p.length))
  let size = Math.min(base, ancho / (palabraMasLarga * peso))
  let partido = lineas(t, size, ancho, peso)
  while (size > base * 0.6 && y + partido.length * size * lh > LIENZO.H - borde) {
    size *= 0.93
    partido = lineas(t, size, ancho, peso)
  }
  size = Math.max(size, base * 0.6)
  const estilo = size === base ? s : s.replace(/font-size:\d+px/, `font-size:${px(size)}`)
  const h = partido.length * size * lh * 1.15 + size * 0.4
  return `<p style="position:absolute;left:${px(x)};top:${px(y)};width:${px(ancho)};min-height:${px(h)};margin:0;${estilo.includes("font-size") ? estilo : `font-size:${px(size)};${estilo}`}">${partido.map(esc).join("<br>")}</p>`
}

/** El lienzo de la pieza que se esta componiendo, para la red contra desbordes. */
let LIENZO = { W: 1080, H: 1350 }

/**
 * Una pastilla de una linea: se mide con el mismo ancho de caracter con que se
 * parte el texto, y si no cabe en `maxW` encoge la letra en vez de partirse
 * (una pastilla partida en dos se sale por abajo).
 */
function pildora(t: string, x: number, y: number, maxW: number, opciones: { size: number; alto: number; pad: number; fondo: string; color: string; borde?: string }) {
  const largo = Math.max(1, t.length)
  const size = Math.min(opciones.size, (maxW - 2 * opciones.pad) / (largo * PESO_GRUESO))
  const w = Math.min(maxW, largo * size * PESO_GRUESO + 2 * opciones.pad)
  const html =
    bloque(x, y, w, opciones.alto, `background:${opciones.fondo};${opciones.borde ? `border:${opciones.borde};` : ""}border-radius:${px(opciones.alto / 2)};`) +
    texto(t, x, y + (opciones.alto - size * 1.2) / 2, w, `font-size:${px(size)};font-weight:700;line-height:1.2;text-align:center;color:${opciones.color};`)
  return { html, w }
}

function bloque(x: number, y: number, w: number, h: number, s: string) {
  return `<div style="position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};${s}"></div>`
}

function imagen(url: string, x: number, y: number, w: number, h: number, alt: string, extra = "", ajuste = "cover") {
  return `<img src="${esc(url)}" alt="${esc(alt)}" style="position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};object-fit:${ajuste};${extra}">`
}

/**
 * Ancho medio de un caracter respecto a su tamano, por lo alto a proposito:
 * medir de menos hace que una linea no quepa. Las negritas gruesas (los
 * titulos) tienen caracteres mas anchos.
 */
const PESO_GRUESO = 0.66
const PESO_NORMAL = 0.54

/** Parte un texto en lineas que caben en `ancho`. */
function lineas(t: string, size: number, ancho: number, peso: number): string[] {
  const porLinea = Math.max(6, Math.floor(ancho / (size * peso)))
  const salida: string[] = []
  let actual = ""
  for (const p of t.trim().split(/\s+/)) {
    if (actual && actual.length + 1 + p.length > porLinea) {
      salida.push(actual)
      actual = p
    } else actual = actual ? `${actual} ${p}` : p
  }
  if (actual) salida.push(actual)
  return salida
}

/** Alto de un texto con las mismas lineas que va a llevar. */
function alto(t: string, size: number, ancho: number, lh: number, peso = PESO_NORMAL) {
  return lineas(t, size, ancho, peso).length * size * lh
}

/** Reduce el tamano cuando el texto es largo, para que no se coma la lamina. */
function ajustar(t: string, base: number, comodo: number) {
  if (t.length <= comodo) return base
  return Math.round(base * Math.max(0.62, Math.sqrt(comodo / t.length)))
}

function luminancia(hex: string) {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function formatearValor(v: number | string) {
  if (typeof v === "string") return v
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(v)
}

/** El logo de la marca es blanco: sobre fondo claro va dentro de un sello oscuro. */
function logo(c: Ctx, x: number, y: number, lado: number, sobreOscuro: boolean) {
  if (!c.e.logo || !c.logo) return ""
  if (sobreOscuro) return imagen(c.logo, x - lado * 0.18, y - lado * 0.22, lado, lado, "logo", "", "contain")
  return (
    bloque(x, y, lado * 0.7, lado * 0.5, `background:${c.e.colores.texto};border-radius:${px(10 * c.k)};`) +
    imagen(c.logo, x - lado * 0.08, y - lado * 0.3, lado * 0.86, lado * 1.1, "logo", "", "contain")
  )
}

function numeracion(c: Ctx, n: number, total: number, color: string) {
  if (!c.e.numeracion || total < 2) return ""
  const t = `${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`
  return texto(t, c.W - c.m - 220 * c.k, c.m, 220 * c.k, `font-size:${px(26 * c.k)};font-weight:700;color:${color};text-align:right;`)
}

function desliza(c: Ctx, color: string) {
  if (!c.e.textoDesliza) return ""
  return texto(c.e.textoDesliza, c.m, c.H - c.m - 30 * c.k, 500 * c.k, `font-size:${px(26 * c.k)};font-weight:700;letter-spacing:4px;color:${color};`)
}

function pieDeDatos(c: Ctx, l: LaminaCompuesta) {
  const t = [l.fuente ? `Fuente: ${l.fuente}` : "", l.periodo ? `Periodo: ${l.periodo}` : ""].filter(Boolean).join(" · ")
  return texto(t, c.m, c.H - c.m - 26 * c.k, c.W - 2 * c.m, `font-size:${px(22 * c.k)};color:${c.e.colores.textoSuave};`)
}

/** Etiquetas como pastillas, en filas. Devuelve el html y el alto usado. */
function pastillas(c: Ctx, etiquetas: string[], x: number, y: number, ancho: number) {
  let html = ""
  let cx = x
  let cy = y
  const size = 28 * c.k
  const altoP = 58 * c.k
  etiquetas.slice(0, 4).forEach((t, i) => {
    const w = Math.min(ancho, t.length * size * PESO_GRUESO + 50 * c.k)
    if (cx + w > x + ancho) {
      cx = x
      cy += altoP + 14 * c.k
    }
    const destacada = i === 0
    const p = pildora(t, cx, cy, ancho, {
      size,
      alto: altoP,
      pad: 25 * c.k,
      fondo: destacada ? c.e.colores.acento : "transparent",
      color: destacada ? c.e.colores.fondo : c.e.colores.texto,
      borde: `${px(3 * c.k)} solid ${destacada ? c.e.colores.acento : c.e.colores.textoSuave}`,
    })
    html += p.html
    cx += p.w + 14 * c.k
  })
  return { html, alto: etiquetas.length ? cy - y + altoP : 0 }
}

// ------------------------------------------------------------------- cierre

function cierre(c: Ctx, l: LaminaCompuesta) {
  const { W, H, k, m, e } = c
  // Sin las marcas de enfasis: en el cierre se veria el asterisco.
  const titulo = sinMarcas(e.cierre.modo === "fijo" ? e.cierre.titulo : l.titulo)
  const cuerpo = sinMarcas(e.cierre.modo === "fijo" ? e.cierre.texto : l.cuerpo)
  const lado = 300 * k
  const sizeT = ajustar(titulo, 72 * k, 40)
  let html = logo(c, (W - lado * (c.oscuro ? 1 : 0.7)) / 2 + (c.oscuro ? lado * 0.18 : 0), H * 0.17, lado, c.oscuro)
  html += texto(titulo, m, H * 0.44, W - 2 * m, `font-size:${px(sizeT)};line-height:1.1;font-weight:800;color:${e.colores.texto};text-align:center;`)
  const yC = H * 0.44 + alto(titulo, sizeT, W - 2 * m, 1.1, PESO_GRUESO) + 40 * k
  html += texto(cuerpo, 120 * k, yC, W - 240 * k, `font-size:${px(34 * k)};line-height:1.4;color:${e.colores.textoSuave};text-align:center;`)
  return html
}

// -------------------------------------------------------------- fotografico

/** El color de texto que se lee sobre un fondo dado. */
function sobre(fondo: string) {
  return luminancia(fondo) > 0.55 ? "#0A0A0A" : "#FFFFFF"
}

/** Un color de la paleta con transparencia. */
function conAlfa(hex: string, a: number) {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

type Tramo = { texto: string; marca: "normal" | "acento" | "negrita" }

/**
 * Lee las marcas del agente: *acento* en los titulos y **negrita** en el
 * cuerpo. Son las que dan jerarquia dentro de la frase, como en un carrusel
 * hecho a mano: la idea clave cambia de color y de peso.
 */
function tramos(t: string): Tramo[] {
  const salida: Tramo[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let ultimo = 0
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (m.index > ultimo) salida.push({ texto: t.slice(ultimo, m.index), marca: "normal" })
    salida.push({ texto: m[1] ?? m[2], marca: m[1] ? "negrita" : "acento" })
    ultimo = m.index + m[0].length
  }
  if (ultimo < t.length) salida.push({ texto: t.slice(ultimo), marca: "normal" })
  return salida.filter((x) => x.texto.trim())
}

export const sinMarcas = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")

/**
 * Texto con tramos de distinto estilo, con las lineas partidas por el sistema
 * (Canva las parte con otra fuente si se le deja). `saltoAntesDeAcento` pone
 * la parte destacada en su propia linea, como la portada de un carrusel.
 */
function textoRico(
  t: string,
  x: number,
  y: number,
  ancho: number,
  base: { size: number; lh: number; peso: number; css: string },
  estilos: Record<Tramo["marca"], string>,
  saltoAntesDeAcento = false
): { html: string; h: number } {
  const palabras: { p: string; marca: Tramo["marca"]; corte: boolean }[] = []
  for (const tr of tramos(t)) {
    tr.texto
      .trim()
      .split(/\s+/)
      .forEach((p, i) => palabras.push({ p, marca: tr.marca, corte: saltoAntesDeAcento && tr.marca === "acento" && i === 0 }))
  }
  const porLinea = Math.max(6, Math.floor(ancho / (base.size * base.peso)))
  const lineasP: (typeof palabras)[] = [[]]
  let largo = 0
  for (const w of palabras) {
    const actual = lineasP[lineasP.length - 1]
    if (actual.length && (w.corte || largo + 1 + w.p.length > porLinea)) {
      lineasP.push([w])
      largo = w.p.length
    } else {
      actual.push(w)
      largo += (actual.length > 1 ? 1 : 0) + w.p.length
    }
  }
  const html = lineasP
    .map((linea) => {
      let out = ""
      let i = 0
      while (i < linea.length) {
        const marca = linea[i].marca
        const run: string[] = []
        while (i < linea.length && linea[i].marca === marca) run.push(linea[i++].p)
        const pedazo = esc(run.join(" "))
        const sep = out ? " " : ""
        out += marca === "normal" ? sep + pedazo : `${sep}<span style="${estilos[marca]}">${pedazo}</span>`
      }
      return out
    })
    .join("<br>")
  const h = lineasP.length * base.size * base.lh
  return {
    html: `<p style="position:absolute;left:${px(x)};top:${px(y)};width:${px(ancho)};min-height:${px(h * 1.15 + base.size * 0.4)};margin:0;font-size:${px(base.size)};line-height:${base.lh};${base.css}">${html}</p>`,
    h,
  }
}

/** Logo y numeracion sobre pastillas translucidas: se leen sobre cualquier foto. */
function cabeceraSobreFoto(c: Ctx, n: number, total: number) {
  const { W, k, m, e } = c
  let html = ""
  if (e.logo && c.logo) {
    html += bloque(m - 14 * k, m - 6 * k, 150 * k, 92 * k, `background:rgba(0,0,0,0.42);border-radius:${px(14 * k)};`)
    html += logo(c, m + 6 * k, m - 4 * k, 128 * k, true)
  }
  if (e.numeracion && total > 1) {
    html += bloque(W - m - 150 * k, m - 6 * k, 164 * k, 52 * k, `background:rgba(0,0,0,0.42);border-radius:${px(26 * k)};`)
    html += texto(`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - m - 150 * k, m + 4 * k, 164 * k, `font-size:${px(26 * k)};font-weight:700;color:#FFFFFF;text-align:center;`)
  }
  return html
}

/** "Desliza" como un boton: una pastilla con flecha, abajo a la izquierda. */
function botonDesliza(c: Ctx) {
  const { k, m, H, e } = c
  if (!e.textoDesliza) return ""
  const t = e.textoDesliza.replace(/→/g, "").trim()
  const w = t.length * 24 * k * 0.66 + 130 * k
  const h = 56 * k
  const y = H - m - h + 10 * k
  return (
    // Relleno solido, sin borde: con borde, Canva dibujaba un recuadro cuadrado
    // alrededor de la pastilla redondeada.
    bloque(m, y, w, h, `background:${e.colores.acento};border-radius:${px(h / 2)};`) +
    texto(`${t}  →`, m, y + 14 * k, w, `font-size:${px(24 * k)};line-height:1.1;font-weight:700;letter-spacing:2px;text-align:center;color:${sobre(e.colores.acento)};`)
  )
}

/**
 * Un recurso de apoyo dentro de la columna de texto, de arriba abajo. Solo los
 * que informan: una lista numerada, una cifra con su explicacion o pastillas
 * con datos. Devuelve el html y el alto.
 */
function recursoEnColumna(c: Ctx, r: Recurso, x: number, y: number, ancho: number) {
  const { k, e } = c
  if (r.tipo === "lista" && r.items?.length) {
    const size = 32 * k
    let html = ""
    r.items.slice(0, 4).forEach((it, i) => {
      const fila = textoRico(`*${String(i + 1).padStart(2, "0")}* ${it}`, x, y + i * size * 1.6, ancho, { size, lh: 1.3, peso: PESO_NORMAL, css: `font-weight:400;color:${e.colores.texto};` }, { normal: "", negrita: "", acento: `color:${e.colores.acento};font-weight:800;` })
      html += fila.html
    })
    return { html, h: r.items.slice(0, 4).length * size * 1.6 }
  }
  if (r.tipo === "cifra" && r.valor) {
    const size = ajustar(r.valor, 92 * k, 7)
    // La cifra en negrita gruesa es mas ancha que un texto normal ("%" sobre
    // todo): se mide con margen para que la linea separadora no la pise.
    const anchoValor = Math.min(ancho * 0.55, r.valor.length * size * 0.74 + 10 * k)
    let html = texto(r.valor, x, y, anchoValor + 40 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${e.colores.acento};`)
    if (r.texto) {
      const xTexto = x + anchoValor + 48 * k
      const anchoTexto = ancho - anchoValor - 48 * k
      const altoTexto = alto(r.texto, 28 * k, anchoTexto, 1.2)
      html += bloque(x + anchoValor + 22 * k, y + size * 0.1, 3 * k, size * 0.8, `background:${conAlfa(e.colores.texto, 0.5)};`)
      // La explicacion, centrada en vertical respecto a la cifra.
      html += texto(r.texto, xTexto, y + Math.max(0, (size - altoTexto) / 2), anchoTexto, `font-size:${px(28 * k)};line-height:1.2;font-weight:400;color:${e.colores.textoSuave};`)
    }
    return { html, h: size * 1.05 }
  }
  if (r.tipo === "datos" && r.items?.length) {
    const size = 24 * k
    const h = 50 * k
    let cx = x
    let cy = y
    let html = ""
    r.items.slice(0, 3).forEach((it, i) => {
      const w = Math.min(ancho, it.length * size * PESO_GRUESO + 50 * k)
      if (cx + w > x + ancho) {
        cx = x
        cy += h + 12 * k
      }
      const fondo = i === 0 ? e.colores.acento : conAlfa(e.colores.texto, 0.16)
      const p = pildora(it, cx, cy, ancho, { size, alto: h, pad: 25 * k, fondo, color: i === 0 ? sobre(e.colores.acento) : e.colores.texto })
      html += p.html
      cx += p.w + 12 * k
    })
    return { html, h: cy - y + h }
  }
  return { html: "", h: 0 }
}

/**
 * El bloque de texto de una lamina fotografica: antetitulo, titulo en dos
 * tonos (la idea clave en acento y otro peso), cuerpo con la frase clave en
 * negrita y, si informa, un recurso. Se mide antes de colocarlo.
 */
function bloqueFoto(c: Ctx, l: LaminaCompuesta, ancho: number, portada: boolean) {
  const { k, e } = c
  const partes: { h: number; html: (x: number, y: number) => string }[] = []
  const sep = (h: number) => partes.push({ h, html: () => "" })

  if (l.antetitulo) {
    const t = l.antetitulo.toUpperCase()
    partes.push({ h: 24 * k * 1.3, html: (x, y) => texto(t, x, y, ancho, `font-size:${px(24 * k)};line-height:1.3;font-weight:700;letter-spacing:3px;color:${e.colores.acento};`) })
    sep(16 * k)
  }

  const sizeT = ajustar(sinMarcas(l.titulo), (portada ? 80 : 60) * k, portada ? 60 : 55)
  const baseT = { size: sizeT, lh: 1.06, peso: PESO_GRUESO, css: `font-weight:800;color:${e.colores.texto};` }
  const estT = { normal: "", negrita: "", acento: `color:${e.colores.acento};font-weight:300;${portada ? "text-transform:uppercase;" : ""}` }
  const medidaT = textoRico(l.titulo, 0, 0, ancho, baseT, estT, portada)
  partes.push({ h: medidaT.h, html: (x, y) => textoRico(l.titulo, x, y, ancho, baseT, estT, portada).html })

  if (l.cuerpo) {
    sep(22 * k)
    const baseC = { size: 32 * k, lh: 1.38, peso: PESO_NORMAL, css: `font-weight:300;color:${e.colores.textoSuave};` }
    const estC = { normal: "", acento: `color:${e.colores.acento};font-weight:700;`, negrita: `font-weight:800;color:${e.colores.texto};` }
    const medidaC = textoRico(l.cuerpo, 0, 0, ancho, baseC, estC)
    partes.push({ h: medidaC.h, html: (x, y) => textoRico(l.cuerpo, x, y, ancho, baseC, estC).html })
  }

  if (l.recurso && !portada) {
    const medida = recursoEnColumna(c, l.recurso, 0, 0, ancho)
    if (medida.h) {
      sep(30 * k)
      partes.push({ h: medida.h, html: (x, y) => recursoEnColumna(c, l.recurso!, x, y, ancho).html })
    }
  }

  const h = partes.reduce((s, p) => s + p.h, 0)
  return {
    h,
    html: (x: number, y: number) => {
      let out = ""
      let cy = y
      for (const p of partes) {
        out += p.html(x, cy)
        cy += p.h
      }
      return out
    },
  }
}

/**
 * Fotografico. La foto manda. La composicion alterna la foto a sangre (con el
 * texto sobre un degradado) y la foto arriba con un panel solido, y el
 * refuerzo visual esta en el texto mismo: jerarquia de antetitulo, titulo en
 * dos tonos, frase clave en negrita, y recursos que informan (lista, cifra,
 * datos). Nada de formas que solo adornan.
 */
function fotografico(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  const dividida = !portada && !c.apaisado && n % 2 === 0
  return dividida ? fotoDividida(c, l, n, total) : fotoInmersiva(c, l, n, total, portada)
}

function fotoInmersiva(c: Ctx, l: LaminaCompuesta, n: number, total: number, portada: boolean) {
  const { W, H, k, m, e } = c
  let html = l.imagen ? imagen(l.imagen, 0, 0, W, H, "foto") : ""
  const ancho = c.apaisado ? W * 0.62 : W - 2 * m
  const bloqueT = bloqueFoto(c, l, ancho, portada)
  const pie = l.rol === "portada" && e.textoDesliza ? 110 * k : 40 * k
  const yTexto = H - m - pie - bloqueT.h

  // Degradado de contraste: escalones finos de velo, porque el degradado CSS
  // no se importa de forma fiable.
  const inicioVelo = Math.max(H * 0.25, yTexto - 120 * k)
  const pasos = 10
  const altoDegradado = 320 * k
  for (let i = 0; i < pasos; i++) {
    html += bloque(0, inicioVelo - altoDegradado + (altoDegradado / pasos) * i, W, H, `background:rgba(0,0,0,${(e.velo / (pasos + 1)).toFixed(3)});`)
  }
  html += bloque(0, inicioVelo, W, H - inicioVelo, `background:rgba(0,0,0,${(e.velo * 0.35).toFixed(2)});`)

  html += bloqueT.html(m, yTexto)
  html += cabeceraSobreFoto(c, n, total)
  if (l.rol === "portada") html += botonDesliza(c)
  return html
}

function fotoDividida(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  // El panel crece con el texto: la foto cede lo justo (nunca menos del 40 %)
  // para que el bloque respire arriba y abajo.
  const bloqueT = bloqueFoto(c, l, W - 2 * m, false)
  const fotoH = Math.max(H * 0.4, Math.min(H * 0.55, H - bloqueT.h - 2 * 80 * k))
  let html = l.imagen ? imagen(l.imagen, 0, 0, W, fotoH, "foto") : ""
  html += bloque(0, fotoH, W, H - fotoH, `background:${e.colores.fondo};`)
  // Una linea de acento marca el corte entre la foto y el panel.
  html += bloque(0, fotoH, W, 6 * k, `background:${e.colores.acento};`)
  const y = Math.max(fotoH + 70 * k, fotoH + (H - fotoH - bloqueT.h) / 2)
  html += bloqueT.html(m, y)
  html += cabeceraSobreFoto(c, n, total)
  return html
}

// -------------------------------------------------------------- ilustracion


function ilustracion(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  if (c.apaisado) {
    const colTexto = W * 0.44
    const sizeT = ajustar(l.titulo, 58 * k, 50)
    html += texto(l.titulo, m, m + 30 * k, colTexto, `font-size:${px(sizeT)};line-height:1.1;font-weight:800;color:${e.colores.texto};`)
    const yC = m + 30 * k + alto(l.titulo, sizeT, colTexto, 1.1, PESO_GRUESO) + 20 * k
    html += texto(l.cuerpo, m, yC, colTexto, `font-size:${px(28 * k)};line-height:1.4;color:${e.colores.textoSuave};`)
    html += pastillas(c, l.etiquetas, m, H - m - 140 * k, colTexto).html
    if (l.imagen) html += imagen(l.imagen, W * 0.5, m, W * 0.5 - m, H - 2 * m, "ilustracion", `border-radius:${px(28 * k)};`)
  } else {
    const sizeT = ajustar(l.titulo, (portada ? 80 : 60) * k, portada ? 60 : 55)
    const yT = m + 60 * k
    html += texto(l.titulo, m, yT, W - 2 * m, `font-size:${px(sizeT)};line-height:1.08;font-weight:800;color:${e.colores.texto};`)
    let y = yT + alto(l.titulo, sizeT, W - 2 * m, 1.08, PESO_GRUESO) + 18 * k
    if (l.cuerpo) {
      html += texto(l.cuerpo, m, y, W - 2 * m, `font-size:${px(32 * k)};line-height:1.35;color:${e.colores.textoSuave};`)
      y += alto(l.cuerpo, 32 * k, W - 2 * m, 1.35) + 30 * k
    }
    const reservaAbajo = (l.etiquetas.length ? 150 * k : 0) + (portada && e.textoDesliza ? 70 * k : 0) + m
    const altoImg = Math.max(H * 0.32, H - y - reservaAbajo)
    if (l.imagen) html += imagen(l.imagen, m, y, W - 2 * m, altoImg, "ilustracion", `border-radius:${px(32 * k)};`)
    html += pastillas(c, l.etiquetas, m, y + altoImg + 30 * k, W - 2 * m).html
  }
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

// --------------------------------------------------------------- infografia

/** Una caja del aspecto de la imagen, lo mas grande posible dentro de la zona y centrada. */
function cajaConAspecto(zona: { x: number; y: number; w: number; h: number }, aspecto: number) {
  const w = Math.min(zona.w, zona.h * aspecto)
  const h = w / aspecto
  return { x: zona.x + (zona.w - w) / 2, y: zona.y + (zona.h - h) / 2, w, h }
}

/**
 * Las etiquetas de un esquema de partes: cada una en una tarjeta al lado con
 * mas espacio de su parte, y una linea que llega al punto exacto donde esta esa
 * parte en la imagen. Las tarjetas de un mismo lado se apartan para no pisarse.
 */
function etiquetasConLinea(
  c: Ctx,
  items: { t: string; px: number; py: number; i: number }[],
  zona: { x: number; y: number; w: number; h: number },
  img: { y: number; h: number }
) {
  const { k, e } = c
  const size = 28 * k
  const pad = 18 * k
  const gap = 16 * k
  const tarjetas = items.map((it) => {
    // Del lado del borde mas cercano a su parte: la linea es corta y las de
    // un lado no cruzan la imagen hasta el otro.
    const izquierda = it.px < zona.x + zona.w / 2
    const espacio = (izquierda ? it.px - zona.x : zona.x + zona.w - it.px) - 40 * k
    const maxW = Math.min(zona.w * 0.46, Math.max(240 * k, espacio))
    const ls = lineas(it.t, size, maxW - 2 * pad, PESO_GRUESO)
    // Con medio caracter de holgura: justo al limite, el texto se partia en
    // una linea mas que la tarjeta y se salia por abajo.
    const w = Math.min(maxW, Math.max(...ls.map((l) => l.length)) * size * PESO_GRUESO + 2 * pad + size * 0.6)
    const h = ls.length * size * 1.18 + 2 * pad
    const x = izquierda ? zona.x : zona.x + zona.w - w
    // Si la parte esta tan cerca del borde que la tarjeta la taparia, la
    // tarjeta va encima (o debajo) y la linea baja recta hasta el punto.
    const tapa = w > espacio
    const arriba = it.py - h - 50 * k >= img.y
    const y = !tapa ? it.py - h / 2 : arriba ? it.py - h - 50 * k : it.py + 50 * k
    return { ...it, izquierda, w, h, x, y, tapa }
  })
  // Por lado, de arriba abajo: cada tarjeta empieza donde acaba la anterior.
  for (const lado of [true, false]) {
    const col = tarjetas.filter((t) => t.izquierda === lado).sort((a, b) => a.py - b.py)
    let tope = img.y
    for (const t of col) {
      t.y = Math.max(t.y, tope)
      tope = t.y + t.h + gap
    }
    // Si la ultima se sale por abajo, la columna sube lo que haga falta.
    const exceso = tope - gap - (img.y + img.h)
    if (exceso > 0) for (const t of col) t.y = Math.max(img.y, t.y - exceso)
  }
  let html = ""
  for (const t of tarjetas) {
    const clave = t.i === 0
    const color = clave ? e.colores.acento : e.colores.texto
    if (t.tapa) {
      // Recta vertical desde el borde de la tarjeta que mira al punto.
      const desde = t.y > t.py ? t.y : t.y + t.h
      html += bloque(t.px - 2 * k, Math.min(desde, t.py), 4 * k, Math.abs(desde - t.py), `background:${color};`)
    } else {
      const yLinea = t.y + t.h / 2
      const xBorde = t.izquierda ? t.x + t.w : t.x
      // Linea en codo: horizontal desde la tarjeta y vertical hasta el punto.
      html += bloque(Math.min(xBorde, t.px), yLinea - 2 * k, Math.abs(t.px - xBorde), 4 * k, `background:${color};`)
      if (Math.abs(yLinea - t.py) > 2 * k) html += bloque(t.px - 2 * k, Math.min(yLinea, t.py), 4 * k, Math.abs(yLinea - t.py), `background:${color};`)
    }
    html += bloque(t.px - 13 * k, t.py - 13 * k, 26 * k, 26 * k, `background:${color};border-radius:${px(13 * k)};border:${px(5 * k)} solid ${e.colores.fondo};`)
    html += bloque(t.x, t.y, t.w, t.h, `background:${color};border-radius:${px(14 * k)};`)
    html += texto(t.t, t.x + pad, t.y + pad, t.w - 2 * pad, `font-size:${px(size)};line-height:1.18;font-weight:800;color:${sobre(color)};`)
  }
  return html
}

/** La leyenda de un esquema de pasos: numero en un circulo y su accion, en una o dos columnas. */
function leyendaPasos(c: Ctx, pasos: string[], x: number, y: number, ancho: number) {
  const { k, e } = c
  const cols = pasos.length >= 3 ? 2 : 1
  const gapX = 36 * k
  const anchoCol = (ancho - gapX * (cols - 1)) / cols
  const circulo = 52 * k
  const size = 28 * k
  const anchoTexto = anchoCol - circulo - 18 * k
  let html = ""
  let h = 0
  for (let fila = 0; fila * cols < pasos.length; fila++) {
    const enFila = pasos.slice(fila * cols, fila * cols + cols)
    const altoFila = Math.max(circulo, ...enFila.map((p) => alto(p, size, anchoTexto, 1.2, PESO_GRUESO)))
    enFila.forEach((p, j) => {
      const i = fila * cols + j
      const cx = x + j * (anchoCol + gapX)
      const cy = y + h
      html += bloque(cx, cy, circulo, circulo, `background:${e.colores.acento};border-radius:${px(circulo / 2)};`)
      html += texto(String(i + 1), cx, cy + (circulo - size * 1.15) / 2, circulo, `font-size:${px(size)};line-height:1.15;font-weight:800;text-align:center;color:${sobre(e.colores.acento)};`)
      html += texto(p, cx + circulo + 18 * k, cy + Math.max(0, (circulo - alto(p, size, anchoTexto, 1.2, PESO_GRUESO)) / 2), anchoTexto, `font-size:${px(size)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
    })
    h += altoFila + 20 * k
  }
  return { html, h: Math.max(0, h - 20 * k) }
}

/**
 * Infografia. La imagen manda y las etiquetas explican lo que se ve en ella:
 * - "partes": cada etiqueta en una tarjeta con una linea hasta su parte.
 * - "pasos": un numero sobre el lugar de cada paso y la leyenda debajo.
 * Los puntos salen de ubicar cada parte en la imagen ya generada; una etiqueta
 * sin punto no lleva linea: va en la leyenda o en una pastilla.
 */
function infografia(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  // Titulo arriba, grueso y grande; subtitulo breve debajo.
  const anchoTit = c.apaisado ? W * 0.45 : W - 2 * m
  const sizeT = ajustar(l.titulo, (portada ? 76 : 62) * k, 50)
  const yT = m + 50 * k
  html += texto(l.titulo, m, yT, anchoTit, `font-size:${px(sizeT)};line-height:1.06;font-weight:800;color:${e.colores.texto};`)
  let y = yT + alto(l.titulo, sizeT, anchoTit, 1.06, PESO_GRUESO) + 16 * k
  if (l.cuerpo) {
    html += texto(l.cuerpo, m, y, anchoTit, `font-size:${px(30 * k)};line-height:1.3;color:${e.colores.textoSuave};`)
    y += alto(l.cuerpo, 30 * k, anchoTit, 1.3) + 30 * k
  }

  const etiquetas = l.etiquetas.slice(0, 4)
  const pasos = l.esquema === "pasos" && etiquetas.length > 0
  const conPunto = etiquetas.map((t, i) => ({ t, i, p: l.puntos[i] ?? null }))
  // Sin imagen no hay donde apuntar: todas van abajo.
  const sinPunto = conPunto.filter((x) => !x.p || !l.imagen).map((x) => x.t)
  const pie = portada && e.textoDesliza ? 70 * k : 0
  const zona = c.apaisado
    ? { x: W * 0.5, y: m, w: W * 0.5 - m, h: H - 2 * m }
    : { x: m, y, w: W - 2 * m, h: H - y - m - pie }

  // Lo que va debajo de la imagen: la leyenda de los pasos, o las etiquetas
  // que no se pudieron ubicar.
  const anchoAbajo = c.apaisado ? W * 0.42 : zona.w
  const abajo = pasos ? leyendaPasos(c, etiquetas, 0, 0, anchoAbajo).h : sinPunto.length ? pastillas(c, sinPunto, 0, 0, anchoAbajo).alto : 0
  const reservaAbajo = c.apaisado || !abajo ? 0 : abajo + 36 * k

  const img = cajaConAspecto({ ...zona, h: zona.h - reservaAbajo }, l.aspecto ?? 1)
  if (l.imagen) html += imagen(l.imagen, img.x, img.y, img.w, img.h, "render", `border-radius:${px(24 * k)};`, "cover")

  const enImagen = l.imagen
    ? conPunto
        .filter((x): x is { t: string; i: number; p: { x: number; y: number } } => Boolean(x.p))
        .map((x) => ({ t: x.t, i: x.i, px: img.x + x.p.x * img.w, py: img.y + x.p.y * img.h }))
    : []

  if (pasos) {
    // El numero de cada paso, sobre el lugar donde ocurre.
    const lado = 64 * k
    // Dos pasos en el mismo sitio se apartan: un numero no puede tapar a otro.
    for (let i = 1; i < enImagen.length; i++)
      for (let j = 0; j < i; j++) {
        const a = enImagen[j]
        const b = enImagen[i]
        const d = Math.hypot(b.px - a.px, b.py - a.py)
        if (d < lado * 1.1) {
          const ux = d ? (b.px - a.px) / d : 1
          const uy = d ? (b.py - a.py) / d : 0
          b.px = a.px + ux * lado * 1.1
          b.py = a.py + uy * lado * 1.1
        }
      }
    for (const it of enImagen) {
      html += bloque(it.px - lado / 2, it.py - lado / 2, lado, lado, `background:${e.colores.acento};border-radius:${px(lado / 2)};border:${px(5 * k)} solid ${e.colores.fondo};`)
      html += texto(String(it.i + 1), it.px - lado / 2, it.py - 30 * k * 0.6, lado, `font-size:${px(30 * k)};line-height:1.15;font-weight:800;text-align:center;color:${sobre(e.colores.acento)};`)
    }
  } else if (enImagen.length) {
    html += etiquetasConLinea(c, enImagen, zona, img)
  }

  const yAbajo = c.apaisado ? H - m - abajo - pie : img.y + img.h + 36 * k
  if (pasos) html += leyendaPasos(c, etiquetas, m, yAbajo, anchoAbajo).html
  else if (sinPunto.length) html += pastillas(c, sinPunto, m, yAbajo, anchoAbajo).html

  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

// ------------------------------------------------------------------ dataviz

/** Un icono en un circulo tenue del color de acento. */
function insignia(c: Ctx, url: string, x: number, y: number, lado: number) {
  return (
    bloque(x, y, lado, lado, `background:${conAlfa(c.e.colores.acento, 0.12)};border-radius:${px(lado / 2)};`) +
    imagen(url, x + lado * 0.22, y + lado * 0.22, lado * 0.56, lado * 0.56, "icono", "", "contain")
  )
}

function grafico(c: Ctx, g: Grafico, x: number, y: number, w: number, h: number) {
  const { k, e } = c
  const items = g.items.slice(0, g.tipo === "cifras" ? 3 : 6)
  if (items.length === 0) return ""
  const numericos = items.map((i) => (typeof i.valor === "number" ? i.valor : parseFloat(String(i.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0))
  const max = Math.max(...numericos.map(Math.abs), 1)
  const destacado = g.destacado ?? numericos.indexOf(Math.max(...numericos))
  const neutro = luminancia(e.colores.fondo) > 0.5 ? "#CFCFCF" : "#4A4A4A"
  const colorVar = (v?: string) => (v === "sube" ? e.colores.subida : v === "baja" ? e.colores.bajada : e.colores.texto)
  // El mismo icono en todas las categorias no distingue nada: sobra.
  if (items.length > 1 && new Set(items.map((i) => i.iconoUrl)).size === 1) items.forEach((i) => (i.iconoUrl = undefined))
  const conIconos = items.some((i) => i.iconoUrl)
  let html = ""

  if (g.tipo === "cifras") {
    // Cada tarjeta mide lo que lleva dentro (cifra, nombre y nota), y la cifra
    // se encoge si la zona no da: antes la tarjeta se encogia y la nota quedaba
    // fuera, tapada por la tarjeta siguiente. El icono va a la derecha.
    const gap = 30 * k
    const pad = 34 * k
    const reservaIcono = conIconos ? 130 * k : 0
    const anchoT = w - 100 * k - reservaIcono
    const fijo = (it: (typeof items)[number]) => 2 * pad + 14 * k + 40 * k + (it.nota ? 40 * k : 0)
    const disponible = (h - gap * (items.length - 1)) / items.length
    const sizeMax = Math.min(150 * k, Math.max(60 * k, disponible - Math.max(...items.map(fijo))))
    const valores = items.map((it) => valorDe(g, it))
    // La cifra va siempre en una linea (encoge si no cabe) y se mide con el
    // alto de linea con que Canva la pinta (~1.15), no con el del CSS: medida
    // a 1, la cifra pisaba su nombre.
    const altos = items.map((it, i) => {
      const v = medirValor(valores[i], sizeMax, anchoT)
      const textos = alto(it.etiqueta, 32 * k, anchoT, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, 26 * k, anchoT, 1.2) : 0)
      return { size: v.size, altoValor: v.h, h: 2 * pad + v.h + 14 * k + textos }
    })
    const total = altos.reduce((s, a) => s + a.h, 0) + gap * (items.length - 1)
    const fondoTarjeta = luminancia(e.colores.fondo) > 0.5 ? "#F2F2F2" : "#1C1C1C"

    // Si apiladas no caben, van lado a lado: mismas tarjetas, en una fila, con
    // el icono arriba.
    if (total > h && items.length > 1) {
      const wc = (w - gap * (items.length - 1)) / items.length
      const ladoIcono = conIconos ? 64 * k : 0
      // Con margen (0.9): justo en el limite, la cifra salta de linea.
      const medidas = valores.map((v) => medirValor(v, 110 * k, 0.9 * (wc - 60 * k)))
      const size = Math.min(...medidas.map((d) => d.size))
      const altoValor = Math.max(...medidas.map((d) => d.h))
      // El nombre y la nota se miden ya partidos al ancho de la tarjeta: en
      // una tarjeta estrecha ocupan varias lineas.
      const altoTextos = Math.max(
        ...items.map((it) => alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, 24 * k, wc - 60 * k, 1.2) : 0))
      )
      const hc = 2 * pad + altoValor + 14 * k + altoTextos + 20 * k + (ladoIcono ? ladoIcono + 18 * k : 0)
      const cy0 = y + Math.max(0, (h - hc) / 2)
      items.forEach((it, i) => {
        const cx = x + i * (wc + gap)
        html += bloque(cx, cy0, wc, hc, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
        let ty = cy0 + pad
        if (it.iconoUrl) html += imagen(it.iconoUrl, cx + 30 * k, ty, ladoIcono, ladoIcono, "icono", "", "contain")
        if (ladoIcono) ty += ladoIcono + 18 * k
        html += texto(valores[i], cx + 30 * k, ty, wc - 60 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
        ty += altoValor + 14 * k
        html += texto(it.etiqueta, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(28 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
        ty += alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k
        if (it.nota) html += texto(it.nota, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(24 * k)};line-height:1.2;color:${e.colores.textoSuave};`)
      })
      return html
    }

    let cy = y + Math.max(0, (h - total) / 2)
    items.forEach((it, i) => {
      const { size, h: alto1, altoValor } = altos[i]
      html += bloque(x, cy, w, alto1, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
      if (it.iconoUrl) {
        const lado = Math.min(100 * k, alto1 - 40 * k)
        html += imagen(it.iconoUrl, x + w - 50 * k - lado, cy + (alto1 - lado) / 2, lado, lado, "icono", "", "contain")
      }
      let ty = cy + pad
      html += texto(valores[i], x + 50 * k, ty, anchoT, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
      ty += altoValor + 14 * k
      html += texto(it.etiqueta, x + 50 * k, ty, anchoT, `font-size:${px(32 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
      ty += alto(it.etiqueta, 32 * k, anchoT, 1.2, PESO_GRUESO) + 6 * k
      if (it.nota) html += texto(it.nota, x + 50 * k, ty, anchoT, `font-size:${px(26 * k)};line-height:1.2;color:${e.colores.textoSuave};`)
      cy += alto1 + gap
    })
    return html
  }

  if (g.tipo === "columnas") {
    const hueco = w / items.length
    const anchoCol = hueco * 0.6
    const base = y + h - 70 * k
    items.forEach((it, i) => {
      const altoCol = Math.max(8 * k, (Math.abs(numericos[i]) / max) * (h - 170 * k))
      const cx = x + i * hueco + (hueco - anchoCol) / 2
      html += bloque(cx, base - altoCol, anchoCol, altoCol, `background:${i === destacado ? e.colores.acento : neutro};border-radius:${px(8 * k)} ${px(8 * k)} 0 0;`)
      const v = valorDe(g, it)
      html += texto(v, x + i * hueco, base - altoCol - 56 * k, hueco, `font-size:${px(Math.min(34 * k, hueco / (Math.max(4, v.length) * PESO_GRUESO)))};font-weight:800;text-align:center;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
      html += texto(it.etiqueta, x + i * hueco, base + 14 * k, hueco, `font-size:${px(24 * k)};line-height:1.15;font-weight:700;text-align:center;color:${e.colores.texto};`)
    })
    return html
  }

  // barras y ranking: filas horizontales, el nombre junto a su barra y, si lo
  // hay, su icono delante.
  const paso = Math.min(170 * k, h / items.length)
  const rank = g.tipo === "ranking"
  const xb = x + (rank ? 80 * k : 0)
  // A la derecha de la barra mas larga tiene que caber su cifra, con flecha y
  // unidad, en una sola linea: se reserva el ancho del valor mas largo.
  const valores = items.map((it) => valorDe(g, it))
  const sizeValor = Math.min(...valores.map((v) => ajustar(v, 38 * k, 10)))
  const reserva = Math.min(w * 0.45, Math.max(...valores.map((v) => v.length)) * sizeValor * PESO_GRUESO + 40 * k)
  const wb = w - (rank ? 80 * k : 0) - reserva
  const ladoIcono = conIconos ? 44 * k : 0
  items.forEach((it, i) => {
    const cy = y + i * paso
    if (rank) html += texto(String(i + 1), x, cy + 18 * k, 70 * k, `font-size:${px(56 * k)};font-weight:800;color:${i === destacado ? e.colores.acento : e.colores.textoSuave};`)
    if (it.iconoUrl) html += imagen(it.iconoUrl, xb, cy - 4 * k, ladoIcono, ladoIcono, "icono", "", "contain")
    const xEtiqueta = xb + (ladoIcono ? ladoIcono + 14 * k : 0)
    html += texto(it.etiqueta, xEtiqueta, cy, w - (xEtiqueta - x), `font-size:${px(30 * k)};font-weight:700;color:${e.colores.texto};`)
    const wBarra = Math.max(10 * k, (Math.abs(numericos[i]) / max) * wb)
    html += bloque(xb, cy + 48 * k, wBarra, 52 * k, `background:${i === destacado ? e.colores.acento : neutro};border-radius:${px(6 * k)};`)
    html += texto(valores[i], xb + wBarra + 18 * k, cy + 50 * k + (38 * k - sizeValor) / 2, reserva, `font-size:${px(sizeValor)};font-weight:800;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
  })
  return html
}

/** El valor de un dato como se lee: flecha de variacion, cifra y unidad. */
function valorDe(g: Grafico, it: Grafico["items"][number]) {
  const flecha = it.variacion === "sube" ? "▲ " : it.variacion === "baja" ? "▼ " : ""
  const t = formatearValor(it.valor)
  // Una "unidad" larga ("puntos criticos de fuga") no es una unidad: es texto
  // que ya dice la etiqueta, y junto a cada barra solo estorba.
  const unidad = g.unidad.length <= 10 ? g.unidad : ""
  return flecha + (unidad && !/[%$]/.test(t) ? `${t} ${unidad}` : t)
}

/**
 * El tamano de una cifra grande: en una linea, encogiendo hasta la mitad; si
 * aun asi no cabe (el agente escribio una frase como cifra), en dos lineas.
 * El alto va con el interlineado con que Canva la pinta (~1.15).
 */
function medirValor(v: string, max: number, ancho: number) {
  const unaLinea = Math.min(ajustar(v, max, 10), ancho / (Math.max(4, v.length) * PESO_GRUESO))
  if (unaLinea >= max * 0.5) return { size: unaLinea, h: unaLinea * 1.15 }
  const size = max * 0.5
  return { size, h: lineas(v, size, ancho, PESO_GRUESO).length * size * 1.15 }
}

/** Titulo (la conclusion del dato) y cuerpo, desde `y`. Devuelve donde acaban. */
function cabeceraDatos(c: Ctx, l: LaminaCompuesta, y: number, ancho: number, portada: boolean) {
  const { k, m, e } = c
  const sizeT = ajustar(l.titulo, (portada ? 72 : 58) * k, 55)
  let html = texto(l.titulo, m, y, ancho, `font-size:${px(sizeT)};line-height:1.06;font-weight:800;color:${e.colores.texto};`)
  y += alto(l.titulo, sizeT, ancho, 1.06, PESO_GRUESO) + 16 * k
  if (l.cuerpo) {
    html += texto(l.cuerpo, m, y, ancho, `font-size:${px(30 * k)};line-height:1.3;color:${e.colores.textoSuave};`)
    y += alto(l.cuerpo, 30 * k, ancho, 1.3) + 40 * k
  } else y += 30 * k
  return { html, y }
}

/**
 * Data-viz. El grafico manda; el apoyo visual son iconos del asunto: el de la
 * lamina arriba, en una insignia, y los de las categorias junto a su dato. Una
 * lamina sin grafico lleva su icono en grande.
 */
function dataviz(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  let yT = m + 50 * k
  if (l.icono) {
    const lado = (portada ? 120 : 100) * k
    html += insignia(c, l.icono, m, m, lado)
    yT = m + lado + 36 * k
  }
  const anchoTit = c.apaisado ? W * 0.42 : W - 2 * m
  const cab = cabeceraDatos(c, l, yT, anchoTit, portada)
  html += cab.html
  const y = cab.y

  const zona = c.apaisado
    ? { x: W * 0.47, y: m + 20 * k, w: W * 0.53 - m, h: H - 2 * m - 90 * k }
    : { x: m, y: y + 20 * k, w: W - 2 * m, h: H - y - m - 120 * k - (l.rol === "portada" && e.textoDesliza ? 50 * k : 0) }
  if (l.grafico) html += grafico(c, l.grafico, zona.x, zona.y, zona.w, zona.h)
  else if (l.icono && zona.h > 200 * k) {
    const lado = Math.min(zona.w * 0.6, zona.h * 0.85)
    html += insignia(c, l.icono, zona.x + (zona.w - lado) / 2, zona.y + (zona.h - lado) / 2, lado)
  }
  html += pieDeDatos(c, l)
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada" && !l.fuente) html += desliza(c, e.colores.textoSuave)
  return html
}

// ---------------------------------------------------------------- infodatos

/**
 * Infografia de datos: la lectura de Data-viz con una imagen clave generada.
 * El titulo es la conclusion del dato; la imagen (cuadrada) se pone al lado de
 * las cifras, o al lado del dato destacado con el grafico debajo.
 */
function infodatos(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  const anchoTit = c.apaisado ? W * 0.42 : W - 2 * m
  const cab = cabeceraDatos(c, l, m + 50 * k, anchoTit, portada)
  let html = cab.html
  const g = l.grafico
  const radio = `border-radius:${px(28 * k)};`
  const conImagen = (x: number, y: number, lado: number) =>
    l.imagen ? imagen(l.imagen, x, y, lado, lado, "imagen clave", radio) : ""

  if (c.apaisado) {
    const lado = Math.min(anchoTit, H - cab.y - m - 60 * k)
    html += conImagen(m, cab.y, lado)
    if (g) html += grafico(c, g, W * 0.47, m + 20 * k, W * 0.53 - m, H - 2 * m - 90 * k)
  } else {
    const zonaW = W - 2 * m
    const disponible = H - cab.y - m - 80 * k - (l.rol === "portada" && !l.fuente && e.textoDesliza ? 50 * k : 0)
    if (!g) {
      const lado = Math.min(zonaW, disponible)
      html += conImagen(m + (zonaW - lado) / 2, cab.y, lado)
    } else if (g.tipo === "cifras") {
      // La imagen a la izquierda y las cifras a su lado, a la misma altura.
      const lado = Math.min(zonaW * 0.46, disponible)
      html += conImagen(m, cab.y, lado)
      html += grafico(c, g, m + lado + 36 * k, cab.y, zonaW - lado - 36 * k, Math.max(lado, disponible))
    } else {
      // La imagen junto al dato destacado, y el grafico completo debajo.
      const lado = Math.min(zonaW * 0.4, disponible * 0.42)
      html += conImagen(m, cab.y, lado)
      const items = g.items
      const numericos = items.map((i) => (typeof i.valor === "number" ? i.valor : parseFloat(String(i.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0))
      const d = items[g.destacado ?? numericos.indexOf(Math.max(...numericos))] ?? items[0]
      if (d) {
        const xD = m + lado + 40 * k
        const anchoD = zonaW - lado - 40 * k
        const valor = valorDe(g, d)
        const size = Math.min(ajustar(valor, 96 * k, 7), anchoD / (Math.max(4, valor.length) * PESO_GRUESO))
        const altoValor = size * 1.15
        const altoNombre = alto(d.etiqueta, 30 * k, anchoD, 1.2, PESO_GRUESO)
        const yD = cab.y + Math.max(0, (lado - altoValor - 14 * k - altoNombre) / 2)
        html += texto(valor, xD, yD, anchoD, `font-size:${px(size)};line-height:1;font-weight:800;color:${d.variacion === "baja" ? e.colores.bajada : e.colores.acento};`)
        html += texto(d.etiqueta, xD, yD + altoValor + 14 * k, anchoD, `font-size:${px(30 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
      }
      const yG = cab.y + lado + 40 * k
      html += grafico(c, g, m, yG, zonaW, H - yG - m - 80 * k)
    }
  }
  html += pieDeDatos(c, l)
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada" && !l.fuente) html += desliza(c, e.colores.textoSuave)
  return html
}

// -------------------------------------------------------------------- todo

const COMPONER: Record<TipoEstilo, (c: Ctx, l: LaminaCompuesta, n: number, total: number) => string> = {
  fotografico,
  ilustracion,
  infografia,
  dataviz,
  infodatos,
}

export function componerHTML(opciones: {
  tipo: TipoEstilo
  estilo: EstiloPlantilla
  ancho: number
  alto: number
  laminas: LaminaCompuesta[]
  logo: string | null
  titulo: string
}): string {
  const { estilo: e } = opciones
  const W = opciones.ancho || 1080
  const H = opciones.alto || 1350
  const k = W / 1080
  LIENZO = { W, H }
  const ctx: Ctx = {
    W,
    H,
    k,
    m: Math.round(80 * k),
    apaisado: W > H * 1.15,
    e,
    logo: opciones.logo,
    oscuro: luminancia(e.colores.fondo) < 0.5,
  }
  const total = opciones.laminas.length
  const paginas = opciones.laminas.map((l, i) => {
    const cuerpo = COMPONER[opciones.tipo](ctx, l, i + 1, total)
    return `<section data-document-role="page" data-label="${esc(l.rol === "portada" ? "Portada" : l.rol === "cierre" ? "Cierre" : `Lámina ${i + 1}`)}" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${e.colores.fondo};font-family:'${e.fuente}',Verdana,sans-serif;">${cuerpo}</section>`
  })
  const fuente = e.fuente.replace(/ /g, "+")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(opciones.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=${fuente}:wght@400;700;800&display=swap" rel="stylesheet">
<style>body{margin:0}</style></head><body>${paginas.join("\n")}</body></html>`
}
