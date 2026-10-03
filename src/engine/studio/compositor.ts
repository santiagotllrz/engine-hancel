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

/** Un apoyo grafico del estilo Fotografico: explica la idea sin tapar la foto. */
export type Recurso = {
  tipo: "cifra" | "etiqueta" | "paso" | "lista"
  valor?: string
  texto?: string
  items?: string[]
}

export type LaminaCompuesta = {
  rol: "portada" | "contenido" | "cierre" | "unica"
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
  const titulo = e.cierre.modo === "fijo" ? e.cierre.titulo : l.titulo
  const cuerpo = e.cierre.modo === "fijo" ? e.cierre.texto : l.cuerpo
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

/**
 * Un recurso grafico de apoyo, dibujado con su base en `yBase` (el borde de
 * abajo). Devuelve el html y el alto que ocupa. Con `derecha`, la cifra se
 * alinea al margen derecho.
 */
function recursoGrafico(c: Ctx, r: Recurso, x: number, yBase: number, derecha = false) {
  const { k, e, W, m } = c
  const tinta = sobre(e.colores.acento)
  if (r.tipo === "cifra" && r.valor) {
    const w = 360 * k
    const h = r.texto ? 200 * k : 150 * k
    const cx = derecha ? W - m - w : x
    const y = yBase - h
    let html = bloque(cx, y, w, h, `background:${e.colores.acento};border-radius:${px(24 * k)};`)
    html += texto(r.valor, cx + 32 * k, y + 22 * k, w - 64 * k, `font-size:${px(ajustar(r.valor, 76 * k, 8))};line-height:1;font-weight:800;color:${tinta};`)
    if (r.texto) html += texto(r.texto, cx + 32 * k, y + 120 * k, w - 64 * k, `font-size:${px(26 * k)};line-height:1.2;font-weight:700;color:${tinta};`)
    return { html, h }
  }
  if (r.tipo === "etiqueta" && r.texto) {
    const t = r.texto.toUpperCase()
    const h = 60 * k
    const w = Math.min(W - 2 * m, t.length * 26 * k * 0.74 + 64 * k)
    let html = bloque(x, yBase - h, w, h, `background:${e.colores.acento};border-radius:${px(h / 2)};`)
    html += texto(t, x, yBase - h + 15 * k, w, `font-size:${px(26 * k)};line-height:1.1;font-weight:800;letter-spacing:2px;text-align:center;color:${tinta};`)
    return { html, h }
  }
  if (r.tipo === "paso" && r.valor) {
    const d = 120 * k
    let html = bloque(x, yBase - d, d, d, `background:${e.colores.acento};border-radius:${px(d / 2)};`)
    html += texto(r.valor, x, yBase - d + 22 * k, d, `font-size:${px(64 * k)};line-height:1.1;font-weight:800;text-align:center;color:${tinta};`)
    return { html, h: d }
  }
  if (r.tipo === "lista" && r.items?.length) {
    const items = r.items.slice(0, 3)
    const fila = 54 * k
    const w = 600 * k
    const h = items.length * fila + 40 * k
    const y = yBase - h
    let html = bloque(x, y, w, h, `background:rgba(0,0,0,0.55);border-radius:${px(20 * k)};border-left:${px(8 * k)} solid ${e.colores.acento};`)
    items.forEach((it, i) => {
      html += texto("✓", x + 30 * k, y + 20 * k + i * fila, 40 * k, `font-size:${px(30 * k)};font-weight:800;color:${e.colores.acento};`)
      html += texto(it, x + 76 * k, y + 20 * k + i * fila, w - 100 * k, `font-size:${px(30 * k)};line-height:1.2;font-weight:700;color:#FFFFFF;`)
    })
    return { html, h }
  }
  return { html: "", h: 0 }
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

/**
 * Fotografico. La foto manda, pero la composicion no es plana: las laminas
 * alternan la foto a sangre (con el texto sobre un degradado) y la foto arriba
 * con un panel solido para el texto. Un recurso grafico (cifra, etiqueta, paso
 * o lista) explica la idea de la lamina sin tapar la foto.
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
  const sizeT = ajustar(l.titulo, (portada ? 78 : 60) * k, portada ? 70 : 55)
  const sizeC = 32 * k
  const altoTexto = alto(l.titulo, sizeT, ancho, 1.08, PESO_GRUESO) + (l.cuerpo ? alto(l.cuerpo, sizeC, ancho, 1.35) + 24 * k : 0)
  const yTexto = H - m - (portada && e.textoDesliza ? 90 * k : 30 * k) - altoTexto
  const rec = l.recurso ? recursoGrafico(c, l.recurso, m, yTexto - 70 * k) : { html: "", h: 0 }

  // Degradado de contraste: escalones finos de velo, porque el degradado CSS
  // no se importa de forma fiable. Arranca por encima del recurso.
  const inicioVelo = Math.max(H * 0.3, yTexto - 120 * k - rec.h)
  const pasos = 10
  const altoDegradado = 320 * k
  for (let i = 0; i < pasos; i++) {
    html += bloque(0, inicioVelo - altoDegradado + (altoDegradado / pasos) * i, W, H, `background:rgba(0,0,0,${(e.velo / (pasos + 1)).toFixed(3)});`)
  }
  html += bloque(0, inicioVelo, W, H - inicioVelo, `background:rgba(0,0,0,${(e.velo * 0.35).toFixed(2)});`)

  html += rec.html
  html += bloque(m, yTexto - 34 * k, 90 * k, 10 * k, `background:${e.colores.acento};border-radius:${px(5 * k)};`)
  html += texto(l.titulo, m, yTexto, ancho, `font-size:${px(sizeT)};line-height:1.08;font-weight:800;color:${e.colores.texto};`)
  if (l.cuerpo) {
    html += texto(l.cuerpo, m, yTexto + alto(l.titulo, sizeT, ancho, 1.08, PESO_GRUESO) + 24 * k, ancho, `font-size:${px(sizeC)};line-height:1.35;color:${e.colores.textoSuave};`)
  }
  html += cabeceraSobreFoto(c, n, total)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

function fotoDividida(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  const fotoH = H * 0.56
  let html = l.imagen ? imagen(l.imagen, 0, 0, W, fotoH, "foto") : ""
  html += bloque(0, fotoH, W, H - fotoH, `background:${e.colores.fondo};`)

  // El recurso se apoya en el borde entre la foto y el panel.
  if (l.recurso) {
    const r = l.recurso
    if (r.tipo === "cifra") html += recursoGrafico(c, r, m, fotoH + 100 * k, true).html
    else if (r.tipo === "paso") html += recursoGrafico(c, r, W - m - 120 * k, fotoH + 60 * k).html
    else html += recursoGrafico(c, r, m, fotoH - 36 * k).html
  }

  // Si el recurso cae a la derecha del panel, el texto le deja sitio.
  const ancho = W - 2 * m - (l.recurso?.tipo === "cifra" ? 380 * k : l.recurso?.tipo === "paso" ? 140 * k : 0)
  const sizeT = ajustar(l.titulo, 56 * k, 55)
  // El bloque de texto se centra en el panel: arriba del todo dejaba media
  // lamina negra debajo.
  const bloqueTexto = alto(l.titulo, sizeT, ancho, 1.1, PESO_GRUESO) + (l.cuerpo ? 22 * k + alto(l.cuerpo, 30 * k, W - 2 * m, 1.4) : 0)
  let y = Math.max(fotoH + 120 * k, fotoH + (H - fotoH - bloqueTexto) / 2)
  html += bloque(m, y - 40 * k, 90 * k, 10 * k, `background:${e.colores.acento};border-radius:${px(5 * k)};`)
  html += texto(l.titulo, m, y, ancho, `font-size:${px(sizeT)};line-height:1.1;font-weight:800;color:${e.colores.texto};`)
  y += alto(l.titulo, sizeT, ancho, 1.1, PESO_GRUESO) + 22 * k
  if (l.cuerpo) html += texto(l.cuerpo, m, y, W - 2 * m, `font-size:${px(30 * k)};line-height:1.4;color:${e.colores.textoSuave};`)
  html += cabeceraSobreFoto(c, n, total)
  return html
}

// -------------------------------------------------------------- ilustracion

/** Una foto real en un circulo con un aro del color de fondo, para separarla del dibujo. */
function fotoCircular(c: Ctx, url: string, x: number, y: number, d: number) {
  const aro = 12 * c.k
  return (
    bloque(x - aro, y - aro, d + 2 * aro, d + 2 * aro, `background:${c.e.colores.fondo};border-radius:${px(d / 2 + aro)};`) +
    imagen(url, x, y, d, d, "foto", `border-radius:${px(d / 2)};`)
  )
}

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
    if (l.foto) html += fotoCircular(c, l.foto, W * 0.5 + 24 * k, H - m - 24 * k - H * 0.42, H * 0.42)
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
    // La foto real aterriza el dibujo: un recorte circular en la esquina del cuadro.
    // A caballo del borde inferior del cuadro, en la esquina que el dibujo deja
    // libre: asi no tapa lo que el dibujo explica.
    if (l.foto) {
      const d = Math.min(340 * k, altoImg * 0.48)
      html += fotoCircular(c, l.foto, W - m - d + 10 * k, y + altoImg - d * 0.62, d)
    }
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
