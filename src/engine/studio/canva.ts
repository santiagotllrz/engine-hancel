import { supabaseAdmin } from "../supabase-admin"
import { formatoPorId } from "@/lib/canales-catalogo"
import { familiaDeFormato, type EstiloPlantilla, type TipoEstilo } from "@/lib/plantillas-catalogo"
import { canvaMcp } from "./canva-mcp"
import { componerHTML, type Grafico, type LaminaCompuesta, type Recurso } from "./compositor"
import { elegirFotos } from "./fotos"
import { generarImagen, proporcionPara } from "./imagenes"

/**
 * El subgenerador de Canva: convierte una pieza escrita en laminas dibujadas.
 *
 *   1. Prepara la imagen de cada lamina segun el estilo: una foto real de
 *      Pexels (Fotografico), una imagen generada sin texto (Ilustracion,
 *      Infografia) o ninguna, porque el grafico lo dibuja el compositor
 *      (Data-viz).
 *   2. El compositor escribe la pieza en HTML para el tamano del formato.
 *   3. Canva la importa como diseno editable; se exporta a PNG y las laminas se
 *      copian al storage, porque las urls de Canva caducan en horas.
 *
 * El diseno queda en Canva por si se quiere retocar a mano.
 */

const BUCKET = "carousels"

export type LaminaPieza = {
  n: number
  type: string
  hook?: string
  title?: string
  body?: string
  foto?: string
  visual?: string
  etiquetas?: string[]
  grafico?: Grafico | null
  recurso?: Recurso | null
  fuente?: string
  periodo?: string
}

export type PiezaParaDibujar = {
  slides: LaminaPieza[]
  title: string
  body: string
  fotos: string[]
  elemento: string
}

export type EstiloUsable = { id: string; tipo: TipoEstilo; estilo: EstiloPlantilla }

export type ResultadoDibujo =
  | { ok: true; imagenes: string[]; designId: string; editUrl: string | null; avisos: string[]; recursos: string[] }
  | { ok: false; error: string; designId?: string }

/** El logo claro de la marca. "perfil" es una captura del perfil, no un logo. */
export async function logoDe(accountId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle()
  const logos = (data as { carousel?: { logos?: { claro?: string | null } } } | null)?.carousel?.logos
  return logos?.claro ?? null
}

/** Copia una imagen temporal (de Canva) al storage, para que no caduque. */
export async function guardarImagen(url: string, ruta: string): Promise<string | null> {
  // Tres intentos: un corte de red al bajar una lamina no puede tumbar una
  // pieza que ya esta dibujada y exportada.
  for (let intento = 0; intento < 3; intento++) {
    try {
      if (intento > 0) await new Promise((r) => setTimeout(r, 1500 * intento))
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.byteLength === 0) continue
      const tipo = res.headers.get("content-type")?.split(";")[0] || "image/png"
      const { error } = await supabaseAdmin().storage.from(BUCKET).upload(ruta, buffer, { contentType: tipo, upsert: true })
      if (error) continue
      return `${supabaseAdmin().storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl}?v=${Date.now().toString(36)}`
    } catch {
      // Se reintenta.
    }
  }
  return null
}

/** Ordena las laminas de la pieza en portada, contenido y cierre. */
function laminasDe(pieza: PiezaParaDibujar, formatId: string, cierreFijo: boolean): (LaminaCompuesta & { pedido: LaminaPieza })[] {
  const a = (l: LaminaPieza, rol: LaminaCompuesta["rol"]) => ({
    rol,
    titulo: (l.hook || l.title || "").trim(),
    cuerpo: (l.body || "").trim(),
    etiquetas: (l.etiquetas ?? []).filter(Boolean).slice(0, 4),
    grafico: l.grafico && Array.isArray(l.grafico.items) && l.grafico.items.length ? l.grafico : null,
    fuente: l.fuente ?? "",
    periodo: l.periodo ?? "",
    imagen: null,
    foto: null,
    recurso: l.recurso ?? null,
    pedido: l,
  })

  if (familiaDeFormato(formatId) === "laminas") {
    const s = pieza.slides
    // La ultima es el cierre solo si es un cierre de verdad: si el agente la
    // escribio con foto, imagen o grafico, es contenido y se dibuja como tal
    // (tratarla como cierre perdia su imagen). Un cierre fijo se anade aparte.
    const ultima = s[s.length - 1]
    const ultimaEsCierre =
      s.length > 2 && !cierreFijo && !ultima.foto && !ultima.visual && !ultima.grafico && !(ultima.etiquetas ?? []).length
    const salida = s.map((l, i) =>
      a(l, i === 0 ? "portada" : i === s.length - 1 && ultimaEsCierre ? "cierre" : "contenido")
    )
    if (cierreFijo) salida.push(a({ n: s.length + 1, type: "cierre" }, "cierre"))
    return salida
  }
  const primera = pieza.slides[0] ?? { n: 1, type: "unica", title: pieza.title, body: pieza.body }
  return [a({ ...primera, title: primera.title || primera.hook || pieza.title, body: primera.body || pieza.body }, "unica")]
}

/** La caja aproximada que ocupa la imagen en cada estilo, para pedirla a su medida. */
function cajaImagen(tipo: TipoEstilo, W: number, H: number, conEtiquetas: boolean) {
  const apaisado = W > H * 1.15
  if (tipo === "fotografico") return { w: W, h: H }
  if (apaisado) return { w: W * 0.5, h: H * 0.85 }
  if (tipo === "infografia") return { w: (W - 160) * (conEtiquetas ? 0.6 : 1), h: H * 0.58 }
  return { w: W - 160, h: H * 0.5 }
}

export async function dibujarConCanva(opciones: {
  estilo: EstiloUsable
  pieza: PiezaParaDibujar
  formatId: string
  titulo: string
  accountId: string
  pieceId: string
  terminosRespaldo: string[]
}): Promise<ResultadoDibujo> {
  const { estilo, pieza, formatId } = opciones
  const fmt = formatoPorId(formatId)
  const W = fmt?.formato.ancho || 1080
  const H = fmt?.formato.alto || 1350
  const laminas = laminasDe(pieza, formatId, estilo.estilo.cierre.modo === "fijo")
  if (laminas.length === 0) return { ok: false, error: "La pieza no trae laminas." }

  const avisos: string[] = []
  const recursos: string[] = []
  const conImagen = laminas.map((l, i) => ({ l, i })).filter(({ l }) => l.rol !== "cierre")
  const carpeta = `studio/${opciones.accountId}/${opciones.pieceId}`

  // ------------------------------------------------------- 1. imagenes
  if (estilo.tipo === "fotografico") {
    const fotos = await elegirFotos(
      conImagen.map(({ l }) => [l.pedido.foto ?? ""].filter(Boolean)),
      [...pieza.fotos, ...opciones.terminosRespaldo],
      W,
      H
    )
    conImagen.forEach(({ l }, k) => {
      const f = fotos[k]
      if (f) {
        l.imagen = f.url
        recursos.push(`Foto de ${f.autor || "Pexels"} (Pexels)`)
      } else avisos.push("Una lamina se quedo sin foto.")
    })
  } else if (estilo.tipo === "ilustracion" || estilo.tipo === "infografia") {
    const c = estilo.estilo.colores
    for (let i = 0; i < conImagen.length; i += 3) {
      await Promise.all(
        conImagen.slice(i, i + 3).map(async ({ l, i: idx }) => {
          const caja = cajaImagen(estilo.tipo, W, H, l.etiquetas.length > 0)
          const base = l.pedido.visual || pieza.elemento || l.titulo
          // En la infografia el objeto tiene que verse grande: las etiquetas
          // señalan sus partes.
          // En la infografia el objeto tiene que verse grande: las etiquetas
          // señalan sus partes.
          const prompt = estilo.tipo === "infografia" ? `${base}. The subject is large and fills most of the frame.` : base
          const r = await generarImagen({
            prompt,
            estiloVisual: estilo.estilo.estiloVisual,
            colores: [c.fondo, c.acento, c.texto],
            proporcion: proporcionPara(caja.w, caja.h),
            ruta: `${carpeta}/imagen-${String(idx + 1).padStart(2, "0")}.png`,
          })
          if ("url" in r) {
            l.imagen = r.url
            recursos.push("Imagen generada (Gemini)")
          } else avisos.push(`Imagen de la lamina ${idx + 1}: ${r.error}`)
        })
      )
    }
  }

  // Data-viz lleva ademas una foto real de apoyo, en una banda sobre el grafico.
  if (estilo.tipo === "dataviz") {
    const conFoto = conImagen.filter(({ l }) => l.pedido.foto)
    if (conFoto.length) {
      const apaisado = W > H * 1.15
      const ancho = W
      const alto = H * (apaisado ? 0.3 : 0.3)
      const fotos = await elegirFotos(
        conFoto.map(({ l }) => [l.pedido.foto ?? ""]),
        opciones.terminosRespaldo,
        ancho,
        alto
      )
      conFoto.forEach(({ l }, k) => {
        const f = fotos[k]
        if (f) {
          l.foto = f.url
          recursos.push(`Foto de ${f.autor || "Pexels"} (Pexels)`)
        }
      })
    }
  }

  // ------------------------------------------------------- 2. componer
  const html = componerHTML({
    tipo: estilo.tipo,
    estilo: estilo.estilo,
    ancho: W,
    alto: H,
    laminas,
    logo: await logoDe(opciones.accountId),
    titulo: opciones.titulo,
  })
  const supabase = supabaseAdmin()
  const rutaHtml = `${carpeta}/pieza-${Date.now().toString(36)}.html`
  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(rutaHtml, Buffer.from(html, "utf8"), {
    contentType: "text/html; charset=utf-8",
    upsert: true,
  })
  if (errSubida) return { ok: false, error: `No se pudo dejar la pieza en el storage: ${errSubida.message}` }
  const urlHtml = supabase.storage.from(BUCKET).getPublicUrl(rutaHtml).data.publicUrl

  // ------------------------------------------------------- 3. Canva
  const tipoCanva = formatId.startsWith("ig_") ? "instagram_post" : formatId.startsWith("fb_") ? "facebook_post" : undefined
  const imp = await canvaMcp<{ job?: { result?: { designs?: { id: string; urls?: { edit_url?: string } }[] } } }>(
    "CANVA_MCP_IMPORT_DESIGN_FROM_URL",
    { url: urlHtml, name: opciones.titulo.slice(0, 200), ...(tipoCanva ? { intended_design_type: tipoCanva } : {}) },
    180_000
  )
  if (!imp.ok) return { ok: false, error: `Canva no pudo importar la pieza: ${imp.error}` }
  const diseno = imp.data.job?.result?.designs?.[0]
  if (!diseno?.id) return { ok: false, error: "Canva no devolvio el diseno importado." }

  const exportacion = await canvaMcp<{ job?: { urls?: string[] } }>(
    "CANVA_MCP_EXPORT_DESIGN",
    { design_id: diseno.id, format: { type: "png", width: W, height: H } },
    180_000
  )
  if (!exportacion.ok) return { ok: false, error: `No se pudo exportar: ${exportacion.error}`, designId: diseno.id }
  const urls = exportacion.data.job?.urls ?? []
  if (urls.length === 0) return { ok: false, error: "Canva no devolvio las imagenes exportadas.", designId: diseno.id }

  const imagenes: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const publica = await guardarImagen(urls[i], `${carpeta}/${String(i + 1).padStart(2, "0")}.png`)
    if (!publica) return { ok: false, error: `No se pudo guardar la lamina ${i + 1}.`, designId: diseno.id }
    imagenes.push(publica)
  }

  return { ok: true, imagenes, designId: diseno.id, editUrl: diseno.urls?.edit_url ?? null, avisos, recursos: [...new Set(recursos)] }
}
