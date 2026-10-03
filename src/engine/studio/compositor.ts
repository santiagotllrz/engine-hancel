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
  items: { etiqueta: string; valor: number | string; variacion?: "sube" | "baja" | "estable"; nota?: string }[]
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
  const size = Number(/font-size:(\d+)px/.exec(s)?.[1] ?? 32)
  const lh = Number(/line-height:([\d.]+)/.exec(s)?.[1] ?? 1.3)
  const peso = /font-weight:(7|8)00/.test(s) ? PESO_GRUESO : PESO_NORMAL
  const partido = lineas(t, size, ancho, peso)
  const h = partido.length * size * lh * 1.15 + size * 0.4
  return `<p style="position:absolute;left:${px(x)};top:${px(y)};width:${px(ancho)};min-height:${px(h)};margin:0;${s}">${partido.map(esc).join("<br>")}</p>`
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
    const w = Math.min(ancho, t.length * size * 0.58 + 50 * c.k)
    if (cx + w > x + ancho) {
      cx = x
      cy += altoP + 14 * c.k
    }
    const destacada = i === 0
    html += bloque(cx, cy, w, altoP, `background:${destacada ? c.e.colores.acento : "transparent"};border:${px(3 * c.k)} solid ${destacada ? c.e.colores.acento : c.e.colores.textoSuave};border-radius:${px(altoP / 2)};`)
    html += texto(t, cx, cy + (altoP - size * 1.2) / 2, w, `font-size:${px(size)};font-weight:700;line-height:1.2;text-align:center;color:${destacada ? c.e.colores.fondo : c.e.colores.texto};`)
    cx += w + 14 * c.k
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
      const w = Math.min(ancho, it.length * size * 0.62 + 50 * k)
      if (cx + w > x + ancho) {
        cx = x
        cy += h + 12 * k
      }
      const fondo = i === 0 ? e.colores.acento : conAlfa(e.colores.texto, 0.16)
      html += bloque(cx, cy, w, h, `background:${fondo};border-radius:${px(h / 2)};`)
      html += texto(it, cx, cy + (h - size * 1.2) / 2, w, `font-size:${px(size)};line-height:1.2;font-weight:700;text-align:center;color:${i === 0 ? sobre(e.colores.acento) : e.colores.texto};`)
      cx += w + 12 * k
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

  // La imagen central y el esquema de partes: etiquetas en una columna con un
  // conector y un punto hacia la imagen. La primera, la del dato clave, en acento.
  const etiquetas = l.etiquetas.slice(0, 4)
  const zona = c.apaisado
    ? { x: W * 0.47, y: m, w: W * 0.53 - m, h: H - 2 * m }
    : { x: m, y, w: W - 2 * m, h: H - y - m - (portada && e.textoDesliza ? 60 * k : 0) }
  const conEtiquetas = etiquetas.length > 0 && !c.apaisado
  const imgW = conEtiquetas ? zona.w * 0.6 : zona.w
  // La caja no pasa de un poco mas alta que ancha: en una caja muy alta el
  // objeto queda pequeno en el centro. Se centra en el espacio que queda.
  const imgH = Math.min(zona.h, imgW * (conEtiquetas ? 1.25 : 0.95))
  const imgY = zona.y + (zona.h - imgH) / 2
  if (l.imagen) html += imagen(l.imagen, zona.x, imgY, imgW, imgH, "render", `border-radius:${px(24 * k)};`, "cover")

  if (conEtiquetas) {
    const colX = zona.x + imgW + 40 * k
    const colW = zona.w - imgW - 40 * k
    const paso = imgH / (etiquetas.length + 1)
    // El conector entra un poco en la imagen, hacia el objeto, que la llena.
    const desde = zona.x + imgW * 0.84
    etiquetas.forEach((t, i) => {
      const cy = imgY + paso * (i + 1)
      const color = i === 0 ? e.colores.acento : e.colores.texto
      html += bloque(desde, cy - 2 * k, colX - desde - 14 * k, 4 * k, `background:${color};`)
      html += bloque(desde - 12 * k, cy - 12 * k, 24 * k, 24 * k, `background:${color};border-radius:${px(12 * k)};border:${px(4 * k)} solid ${e.colores.fondo};`)
      const size = ajustar(t, 32 * k, 18)
      html += texto(t, colX, cy - size * 0.65, colW, `font-size:${px(size)};line-height:1.15;font-weight:800;color:${color};`)
    })
  } else if (etiquetas.length && c.apaisado) {
    html += pastillas(c, etiquetas, m, H - m - 140 * k, W * 0.42).html
  }
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

// ------------------------------------------------------------------ dataviz

function grafico(c: Ctx, g: Grafico, x: number, y: number, w: number, h: number) {
  const { k, e } = c
  const items = g.items.slice(0, g.tipo === "cifras" ? 3 : 6)
  if (items.length === 0) return ""
  const numericos = items.map((i) => (typeof i.valor === "number" ? i.valor : parseFloat(String(i.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0))
  const max = Math.max(...numericos.map(Math.abs), 1)
  const destacado = g.destacado ?? numericos.indexOf(Math.max(...numericos))
  const neutro = luminancia(e.colores.fondo) > 0.5 ? "#CFCFCF" : "#4A4A4A"
  const colorVar = (v?: string) => (v === "sube" ? e.colores.subida : v === "baja" ? e.colores.bajada : e.colores.texto)
  const flecha = (v?: string) => (v === "sube" ? "▲ " : v === "baja" ? "▼ " : "")
  const unidad = (t: string) => (g.unidad && !/[%$]/.test(t) ? `${t} ${g.unidad}` : t)
  let html = ""

  if (g.tipo === "cifras") {
    // Cada tarjeta mide lo que lleva dentro (cifra, nombre y nota), y la cifra
    // se encoge si la zona no da: antes la tarjeta se encogia y la nota quedaba
    // fuera, tapada por la tarjeta siguiente.
    const gap = 30 * k
    const pad = 34 * k
    const fijo = (it: (typeof items)[number]) => 2 * pad + 14 * k + 40 * k + (it.nota ? 40 * k : 0)
    const disponible = (h - gap * (items.length - 1)) / items.length
    const sizeMax = Math.min(150 * k, Math.max(60 * k, disponible - Math.max(...items.map(fijo))))
    const altos = items.map((it) => {
      const valor = flecha(it.variacion) + unidad(formatearValor(it.valor))
      const size = ajustar(valor, sizeMax, 10)
      return { size, h: fijo(it) + alto(valor, size, w - 100 * k, 1, PESO_GRUESO) }
    })
    const total = altos.reduce((s, a) => s + a.h, 0) + gap * (items.length - 1)
    const fondoTarjeta = luminancia(e.colores.fondo) > 0.5 ? "#F2F2F2" : "#1C1C1C"

    // Si apiladas no caben, van lado a lado: mismas tarjetas, en una fila.
    if (total > h && items.length > 1) {
      const wc = (w - gap * (items.length - 1)) / items.length
      const valores = items.map((it) => flecha(it.variacion) + unidad(formatearValor(it.valor)))
      // Con margen (0.9): justo en el limite, la cifra salta de linea.
      const size = Math.min(110 * k, ...valores.map((v) => (0.9 * (wc - 60 * k)) / Math.max(4, v.length * PESO_GRUESO)))
      const altoValor = Math.max(...valores.map((v) => alto(v, size, wc - 60 * k, 1, PESO_GRUESO)))
      const hc = Math.max(...items.map(fijo)) + altoValor + 40 * k
      const cy0 = y + Math.max(0, (h - hc) / 2)
      items.forEach((it, i) => {
        const cx = x + i * (wc + gap)
        html += bloque(cx, cy0, wc, hc, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
        let ty = cy0 + pad
        html += texto(valores[i], cx + 30 * k, ty, wc - 60 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
        ty += alto(valores[i], size, wc - 60 * k, 1, PESO_GRUESO) + 14 * k
        html += texto(it.etiqueta, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(28 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
        ty += alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k
        if (it.nota) html += texto(it.nota, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(24 * k)};line-height:1.2;color:${e.colores.textoSuave};`)
      })
      return html
    }

    let cy = y + Math.max(0, (h - total) / 2)
    items.forEach((it, i) => {
      const { size, h: alto1 } = altos[i]
      html += bloque(x, cy, w, alto1, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
      let ty = cy + pad
      html += texto(flecha(it.variacion) + unidad(formatearValor(it.valor)), x + 50 * k, ty, w - 100 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
      ty += alto(flecha(it.variacion) + unidad(formatearValor(it.valor)), size, w - 100 * k, 1, PESO_GRUESO) + 14 * k
      html += texto(it.etiqueta, x + 50 * k, ty, w - 100 * k, `font-size:${px(32 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
      ty += 40 * k
      if (it.nota) html += texto(it.nota, x + 50 * k, ty, w - 100 * k, `font-size:${px(26 * k)};line-height:1.2;color:${e.colores.textoSuave};`)
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
      html += texto(flecha(it.variacion) + unidad(formatearValor(it.valor)), cx - 30 * k, base - altoCol - 56 * k, anchoCol + 60 * k, `font-size:${px(34 * k)};font-weight:800;text-align:center;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
      html += texto(it.etiqueta, x + i * hueco, base + 14 * k, hueco, `font-size:${px(24 * k)};line-height:1.15;font-weight:700;text-align:center;color:${e.colores.texto};`)
    })
    return html
  }

  // barras y ranking: filas horizontales, el nombre junto a su barra.
  const paso = Math.min(170 * k, h / items.length)
  const rank = g.tipo === "ranking"
  const xb = x + (rank ? 80 * k : 0)
  // A la derecha de la barra mas larga tiene que caber su cifra, con flecha y
  // unidad, en una sola linea: se reserva el ancho del valor mas largo.
  const valores = items.map((it) => flecha(it.variacion) + unidad(formatearValor(it.valor)))
  const sizeValor = Math.min(...valores.map((v) => ajustar(v, 38 * k, 10)))
  const reserva = Math.min(w * 0.45, Math.max(...valores.map((v) => v.length)) * sizeValor * PESO_GRUESO + 40 * k)
  const wb = w - (rank ? 80 * k : 0) - reserva
  items.forEach((it, i) => {
    const cy = y + i * paso
    if (rank) html += texto(String(i + 1), x, cy + 18 * k, 70 * k, `font-size:${px(56 * k)};font-weight:800;color:${i === destacado ? e.colores.acento : e.colores.textoSuave};`)
    html += texto(it.etiqueta, xb, cy, wb, `font-size:${px(30 * k)};font-weight:700;color:${e.colores.texto};`)
    const wBarra = Math.max(10 * k, (Math.abs(numericos[i]) / max) * wb)
    html += bloque(xb, cy + 48 * k, wBarra, 52 * k, `background:${i === destacado ? e.colores.acento : neutro};border-radius:${px(6 * k)};`)
    html += texto(valores[i], xb + wBarra + 18 * k, cy + 50 * k + (38 * k - sizeValor) / 2, reserva, `font-size:${px(sizeValor)};font-weight:800;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
  })
  return html
}

function dataviz(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  // La foto real del asunto, en una banda arriba: da contexto a la cifra sin
  // competir con ella. El logo y la numeracion van sobre ella en pastillas.
  // Mas alta en la portada, salvo que lleve grafico: entonces el espacio es suyo.
  const banda = l.foto ? H * (portada && !l.grafico ? 0.3 : 0.22) : 0
  if (l.foto) {
    html += imagen(l.foto, 0, 0, W, banda, "foto")
    html += bloque(0, banda - 8 * k, W, 8 * k, `background:${e.colores.acento};`)
    html += cabeceraSobreFoto(c, n, total)
  }

  const anchoTit = c.apaisado ? W * 0.42 : W - 2 * m
  const sizeT = ajustar(l.titulo, (portada ? 72 : 58) * k, 55)
  const yT = (l.foto ? banda : m) + 50 * k
  html += texto(l.titulo, m, yT, anchoTit, `font-size:${px(sizeT)};line-height:1.06;font-weight:800;color:${e.colores.texto};`)
  let y = yT + alto(l.titulo, sizeT, anchoTit, 1.06, PESO_GRUESO) + 16 * k
  if (l.cuerpo) {
    html += texto(l.cuerpo, m, y, anchoTit, `font-size:${px(30 * k)};line-height:1.3;color:${e.colores.textoSuave};`)
    y += alto(l.cuerpo, 30 * k, anchoTit, 1.3) + 40 * k
  } else y += 30 * k

  if (l.grafico) {
    const zona = c.apaisado
      ? { x: W * 0.47, y: (l.foto ? banda : m) + 20 * k, w: W * 0.53 - m, h: H - (l.foto ? banda : m) - m - 90 * k }
      : { x: m, y: y + 20 * k, w: W - 2 * m, h: H - y - m - 120 * k - (l.rol === "portada" && e.textoDesliza ? 50 * k : 0) }
    html += grafico(c, l.grafico, zona.x, zona.y, zona.w, zona.h)
  }
  html += pieDeDatos(c, l)
  if (!l.foto) html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada" && !l.fuente) html += desliza(c, e.colores.textoSuave)
  return html
}

// -------------------------------------------------------------------- todo

const COMPONER: Record<TipoEstilo, (c: Ctx, l: LaminaCompuesta, n: number, total: number) => string> = {
  fotografico,
  ilustracion,
  infografia,
  dataviz,
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
