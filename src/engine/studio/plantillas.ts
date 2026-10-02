import { buscarFotos } from "../render/pexels"
import { supabaseAdmin } from "../supabase-admin"
import { formatoPorId } from "@/lib/canales-catalogo"
import {
  familiaDeFormato,
  normalizarEstilo,
  type EstiloPlantilla,
  type EstructuraPlantilla,
} from "@/lib/plantillas-catalogo"
import { canvaMcp, textoDe, type Transaccion } from "./canva-mcp"

/**
 * Construye una plantilla en Canva a partir de sus valores.
 *
 * El diseno maestro se escribe como HTML (una seccion por pagina, marcada con
 * data-document-role="page") y se importa a Canva, que lo convierte en un
 * diseno editable: cada texto queda como elemento de texto y cada imagen como
 * un hueco de imagen. Asi el estilo lo deciden los valores de la plantilla, no
 * el azar de un generador.
 *
 * Los textos llevan marcadores ({{hook}}, {{titulo}}, {{cuerpo}}, {{n}}) y las
 * fotos el texto alternativo "foto": es lo que el agente busca despues en cada
 * copia para reemplazar. Los logos llevan "logo" y no se tocan.
 */

const BUCKET = "carousels"

type Logos = { claro: string | null; perfil: string | null }

async function logosDe(accountId: string): Promise<Logos> {
  const { data } = await supabaseAdmin()
    .from("generation_config")
    .select("carousel")
    .eq("account_id", accountId)
    .maybeSingle()
  const logos = ((data as { carousel?: { logos?: Partial<Logos> } } | null)?.carousel?.logos ?? {}) as Partial<Logos>
  // "perfil" es una captura del perfil de Instagram (la usa el cierre de los
  // carruseles de noticias): como logo no sirve, asi que la plantilla usa el claro.
  return { claro: logos.claro ?? logos.perfil ?? null, perfil: logos.perfil ?? null }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** El HTML del diseno maestro. Exportado para poder previsualizarlo. */
export function htmlDePlantilla(opciones: {
  nombre: string
  formatId: string
  estilo: EstiloPlantilla
  logos: Logos
  fotos: string[]
}): string {
  const { estilo: e, logos } = opciones
  const fmt = formatoPorId(opciones.formatId)
  const W = fmt?.formato.ancho || 1080
  const H = fmt?.formato.alto || 1350
  const k = W / 1080
  const m = Math.round(80 * k)
  const px = (n: number) => `${Math.round(n)}px`
  const foto = (i: number) => opciones.fotos[i % Math.max(1, opciones.fotos.length)]

  const pagina = (label: string, cuerpo: string) =>
    `<section data-document-role="page" data-label="${esc(label)}" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${e.colores.fondo};font-family:'${e.fuente}',Arial,sans-serif;">${cuerpo}</section>`
  const abs = (s: string) => `position:absolute;${s}`
  const img = (alt: string, url: string, s: string, ajuste: "cover" | "contain" = "cover") =>
    `<img src="${esc(url)}" alt="${alt}" style="${abs(s)}object-fit:${ajuste};">`
  // El logo de la marca es una imagen cuadrada con margen: se mete entero en un
  // cuadro, sin recortar, y lo bastante grande para que se lea.
  const logo = (url: string, lado: number, left: number, top: number) =>
    img("logo", url, `left:${px(left)};top:${px(top)};width:${px(lado)};height:${px(lado)};`, "contain")
  const velo = (op: number) =>
    `<div style="${abs(`left:0;top:0;width:${W}px;height:${H}px;background:rgba(0,0,0,${op});`)}"></div>`
  const texto = (contenido: string, s: string) => `<p style="${abs(s)}margin:0;">${contenido}</p>`

  const familia = familiaDeFormato(opciones.formatId)
  const paginas: string[] = []

  if (familia === "imagen") {
    // Una sola pagina: foto de fondo, velo, titulo y apoyo.
    paginas.push(
      pagina(
        "Pieza",
        (e.portada.foto ? img("foto", foto(0), `left:0;top:0;width:${W}px;height:${H}px;`) + velo(e.portada.velo) : "") +
          (e.portada.logo && logos.claro ? logo(logos.claro, 150 * k, m - 30 * k, m - 40 * k) : "") +
          texto("{{titulo}}", `left:${m}px;top:${px(H * 0.5)};width:${W - 2 * m}px;font-size:${px(e.portada.tamanoHook * k * 0.85)};line-height:1.1;font-weight:800;color:${e.colores.texto};`) +
          texto("{{cuerpo}}", `left:${m}px;top:${px(H * 0.78)};width:${W - 2 * m}px;font-size:${px(34 * k)};line-height:1.4;color:${e.colores.textoSuave};`)
      )
    )
  } else {
    // Portada.
    const topHook = e.portada.posicionTexto === "centro" ? H * 0.4 : H * 0.56
    paginas.push(
      pagina(
        "Portada",
        (e.portada.foto ? img("foto", foto(0), `left:0;top:0;width:${W}px;height:${H}px;`) + velo(e.portada.velo) : "") +
          (e.portada.logo && logos.claro ? logo(logos.claro, 150 * k, m - 30 * k, m - 40 * k) : "") +
          texto("{{hook}}", `left:${m}px;top:${px(topHook)};width:${W - 2 * m}px;font-size:${px(e.portada.tamanoHook * k)};line-height:1.08;font-weight:800;color:${e.colores.texto};`) +
          (e.portada.textoDesliza
            ? texto(esc(e.portada.textoDesliza), `left:${m}px;top:${px(H * 0.904)};width:${px(600 * k)};font-size:${px(30 * k)};font-weight:700;letter-spacing:4px;color:${e.colores.textoSuave};`)
            : "")
      )
    )

    // Contenido: todas las laminas posibles. Cada pieza copia solo las que usa.
    for (let i = 0; i < e.laminasContenido; i++) {
      let cuerpo = ""
      let y: number
      if (e.contenido.foto === "arriba") {
        const alto = H * 0.474
        cuerpo += img("foto", foto(i + 1), `left:0;top:0;width:${W}px;height:${px(alto)};`)
        y = alto + 60 * k
      } else if (e.contenido.foto === "fondo") {
        cuerpo += img("foto", foto(i + 1), `left:0;top:0;width:${W}px;height:${H}px;`) + velo(Math.max(0.6, e.portada.velo))
        y = H * 0.48
      } else {
        y = H * 0.2
      }
      if (e.contenido.numeracion) {
        cuerpo += texto("{{n}}", `left:${m}px;top:${px(y)};width:${px(300 * k)};font-size:${px(34 * k)};font-weight:700;color:${e.colores.acento};`)
        y += 70 * k
      }
      cuerpo += texto("{{titulo}}", `left:${m}px;top:${px(y)};width:${W - 2 * m}px;font-size:${px(60 * k)};line-height:1.12;font-weight:800;color:${e.colores.texto};`)
      cuerpo += texto("{{cuerpo}}", `left:${m}px;top:${px(y + 240 * k)};width:${W - 2 * m}px;font-size:${px(36 * k)};line-height:1.4;color:${e.colores.textoSuave};`)
      paginas.push(pagina(`Contenido ${i + 1}`, cuerpo))
    }

    // Cierre.
    const tituloCierre = e.cierre.modo === "agente" ? "{{titulo}}" : esc(e.cierre.titulo)
    const textoCierre = e.cierre.modo === "agente" ? "{{cuerpo}}" : esc(e.cierre.texto)
    const lado = 300 * k
    paginas.push(
      pagina(
        "Cierre",
        (e.cierre.logo && logos.claro ? logo(logos.claro, lado, (W - lado) / 2, H * 0.17) : "") +
          texto(tituloCierre, `left:${m}px;top:${px(H * 0.46)};width:${W - 2 * m}px;font-size:${px(76 * k)};line-height:1.1;font-weight:800;color:${e.colores.texto};text-align:center;`) +
          (textoCierre
            ? texto(textoCierre, `left:${px(120 * k)};top:${px(H * 0.64)};width:${px(W - 240 * k)};font-size:${px(38 * k)};line-height:1.4;color:${e.colores.textoSuave};text-align:center;`)
            : "")
      )
    )
  }

  const familiaFuente = e.fuente.replace(/ /g, "+")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(opciones.nombre)}</title>
<link href="https://fonts.googleapis.com/css2?family=${familiaFuente}:wght@400;700;800&display=swap" rel="stylesheet">
<style>body{margin:0}</style></head><body>${paginas.join("\n")}</body></html>`
}

/** Lee el diseno maestro: paginas, rol de cada una y marcadores. Cierra sin guardar. */
export async function analizarDiseno(
  designId: string,
  formatId: string
): Promise<{ ok: true; estructura: EstructuraPlantilla; thumbnail: string | null } | { ok: false; error: string }> {
  const tx = await canvaMcp<Transaccion & { thumbnails?: { url: string }[] }>("CANVA_MCP_START_EDITING_TRANSACTION", {
    design_id: designId,
  })
  if (!tx.ok) return tx

  try {
    const total = tx.data.pages.length
    const marcadoresDe = (pagina: number) =>
      tx.data.richtexts
        .filter((t) => t.page_index === pagina)
        .flatMap((t) => [...textoDe(t).matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]))

    const laminas = familiaDeFormato(formatId) === "laminas"
    const paginas = tx.data.pages.map((_, i) => {
      const numero = i + 1
      const rol: EstructuraPlantilla["paginas"][number]["rol"] = !laminas
        ? "unica"
        : numero === 1
          ? "portada"
          : numero === total
            ? "cierre"
            : "contenido"
      return { numero, rol }
    })

    if (laminas && total < 3) return { ok: false, error: "Un carrusel necesita portada, contenido y cierre (minimo 3 paginas)." }
    if (laminas && !marcadoresDe(1).includes("hook")) return { ok: false, error: "La portada no tiene el marcador {{hook}}." }
    const sinTitulo = paginas.filter((p) => p.rol === "contenido" && !marcadoresDe(p.numero).includes("titulo"))
    if (sinTitulo.length > 0) {
      return { ok: false, error: `A la lamina ${sinTitulo[0].numero} le falta el marcador {{titulo}}.` }
    }
    if (!laminas && !marcadoresDe(1).includes("titulo")) return { ok: false, error: "La pieza no tiene el marcador {{titulo}}." }

    const marcadores = [...new Set(paginas.flatMap((p) => marcadoresDe(p.numero)))]
    return { ok: true, estructura: { paginas, marcadores }, thumbnail: tx.data.thumbnails?.[0]?.url ?? null }
  } finally {
    await canvaMcp("CANVA_MCP_CANCEL_EDITING_TRANSACTION", { transaction_id: tx.data.transaction.transaction_id })
  }
}

/** Copia una imagen temporal (de Canva) al storage, para que no caduque. */
export async function guardarImagen(url: string, ruta: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const tipo = res.headers.get("content-type")?.split(";")[0] || "image/png"
    const { error } = await supabaseAdmin().storage.from(BUCKET).upload(ruta, buffer, { contentType: tipo, upsert: true })
    if (error) return null
    return `${supabaseAdmin().storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl}?v=${Date.now().toString(36)}`
  } catch {
    return null
  }
}

type FilaPlantilla = { id: string; account_id: string; name: string; format: string; estilo: unknown }

/**
 * Crea (o recrea) en Canva el diseno maestro de una plantilla.
 *
 * Escribe el HTML, lo deja en el storage para que Canva lo pueda leer, lo
 * importa, lee el resultado y guarda el id del diseno, su estructura y una
 * miniatura. Recrear deja el diseno viejo en Canva; la plantilla pasa a usar
 * el nuevo.
 */
export async function construirEnCanva(templateId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("content_templates").select("id, account_id, name, format, estilo").eq("id", templateId).maybeSingle()
  const fila = data as FilaPlantilla | null
  if (!fila) return { ok: false, error: "No existe la plantilla." }

  const fallar = async (error: string) => {
    await supabase.from("content_templates").update({ status: "error", error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", templateId)
    return { ok: false as const, error }
  }

  await supabase.from("content_templates").update({ status: "creando", error: null, updated_at: new Date().toISOString() }).eq("id", templateId)

  const estilo = normalizarEstilo(fila.estilo)
  const fmt = formatoPorId(fila.format)
  const vertical = (fmt?.formato.alto ?? 1350) >= (fmt?.formato.ancho ?? 1080)
  // Fotos de muestra para los huecos: cada pieza las reemplaza por las suyas.
  const muestras = (await buscarFotos("farm field landscape", vertical ? "vertical" : "apaisada")).slice(0, 4).map((f) => f.url)
  if (muestras.length === 0) return fallar("No se pudieron traer fotos de muestra de Pexels (revisa PEXELS_API_KEY).")

  const html = htmlDePlantilla({ nombre: fila.name, formatId: fila.format, estilo, logos: await logosDe(fila.account_id), fotos: muestras })
  const ruta = `plantillas/${fila.account_id}/${fila.id}-${Date.now().toString(36)}.html`
  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(ruta, Buffer.from(html, "utf8"), { contentType: "text/html; charset=utf-8", upsert: true })
  if (errSubida) return fallar(`No se pudo dejar el HTML en el storage: ${errSubida.message}`)
  const url = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl

  const imp = await canvaMcp<{ job?: { status?: string; result?: { designs?: { id: string; urls?: { edit_url?: string } }[] } } }>(
    "CANVA_MCP_IMPORT_DESIGN_FROM_URL",
    { url, name: `Plantilla · ${fila.name}`, intended_design_type: "instagram_post" },
    180_000
  )
  if (!imp.ok) return fallar(imp.error)
  const diseno = imp.data.job?.result?.designs?.[0]
  if (!diseno?.id) return fallar("Canva no devolvio el diseno importado.")

  const lectura = await analizarDiseno(diseno.id, fila.format)
  if (!lectura.ok) return fallar(lectura.error)

  const thumbnail = lectura.thumbnail
    ? await guardarImagen(lectura.thumbnail, `plantillas/${fila.account_id}/${fila.id}-portada.png`)
    : null

  await supabase
    .from("content_templates")
    .update({
      status: "lista",
      error: null,
      canva_design_id: diseno.id,
      canva_edit_url: diseno.urls?.edit_url ?? null,
      estructura: lectura.estructura,
      thumbnail_url: thumbnail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)

  return { ok: true }
}

/** Vuelve a leer el diseno de Canva, por si se retoco a mano. */
export async function releerDeCanva(templateId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("content_templates").select("account_id, format, canva_design_id").eq("id", templateId).maybeSingle()
  const fila = data as { account_id: string; format: string; canva_design_id: string | null } | null
  if (!fila?.canva_design_id) return { ok: false, error: "La plantilla aun no tiene diseno en Canva." }

  const lectura = await analizarDiseno(fila.canva_design_id, fila.format)
  if (!lectura.ok) {
    await supabase.from("content_templates").update({ status: "error", error: lectura.error, updated_at: new Date().toISOString() }).eq("id", templateId)
    return lectura
  }
  const thumbnail = lectura.thumbnail
    ? await guardarImagen(lectura.thumbnail, `plantillas/${fila.account_id}/${templateId}-portada.png`)
    : null
  await supabase
    .from("content_templates")
    .update({
      status: "lista",
      error: null,
      estructura: lectura.estructura,
      ...(thumbnail ? { thumbnail_url: thumbnail } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
  return { ok: true }
}
