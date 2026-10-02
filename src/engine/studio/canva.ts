import { formatoPorId } from "@/lib/canales-catalogo"
import {
  familiaDeFormato,
  normalizarEstilo,
  type EstructuraPlantilla,
} from "@/lib/plantillas-catalogo"
import { canvaMcp, textoDe, type Transaccion } from "./canva-mcp"
import { ponerFotos, type FotoPuesta } from "./fotos"
import { guardarImagen } from "./plantillas"

/**
 * El subgenerador de Canva: dibuja una pieza copiando su plantilla.
 *
 *   1. Copia el diseno maestro con solo las paginas que la pieza usa (portada,
 *      tantas laminas de contenido como escribio el agente, cierre).
 *   2. Abre una transaccion de edicion en la copia.
 *   3. Reemplaza los marcadores ({{hook}}, {{titulo}}, {{cuerpo}}, {{n}}) por
 *      el texto de cada lamina y pone una foto nueva en cada hueco "foto".
 *   4. Guarda, exporta a PNG y copia las imagenes al storage: las urls de
 *      Canva caducan en horas.
 *
 * El diseno de cada pieza queda en Canva, por si se quiere retocar a mano.
 */

export type PlantillaUsable = {
  id: string
  format: string
  canva_design_id: string
  estilo: unknown
  estructura: EstructuraPlantilla
}

type Lamina = { hook?: string; title?: string; body?: string }

export type PiezaParaDibujar = {
  slides: (Lamina & { n: number; type: string })[]
  title: string
  body: string
  caption: string
  fotos: string[]
  elemento: string
}

export type ResultadoDibujo =
  | { ok: true; imagenes: string[]; designId: string; editUrl: string | null; fotos: FotoPuesta[]; avisos: string[] }
  | { ok: false; error: string; designId?: string }

/** Cuantas laminas de contenido admite la plantilla. Lo usa el agente al escribir. */
export function laminasDeContenido(estructura: EstructuraPlantilla): number {
  return estructura.paginas.filter((p) => p.rol === "contenido").length
}

export async function dibujarConCanva(opciones: {
  plantilla: PlantillaUsable
  pieza: PiezaParaDibujar
  titulo: string
  accountId: string
  pieceId: string
  terminosRespaldo: string[]
}): Promise<ResultadoDibujo> {
  const { plantilla, pieza } = opciones
  const estilo = normalizarEstilo(plantilla.estilo)
  const familia = familiaDeFormato(plantilla.format)
  const total = plantilla.estructura.paginas.length

  // ---------------------------------------------- que paginas y que texto
  // valores[i] son los marcadores de la pagina i+1 de la copia.
  let paginas: number[]
  let valores: Record<string, string>[]

  if (familia === "laminas") {
    const [portada, ...resto] = pieza.slides
    if (!portada) return { ok: false, error: "La pieza no trae laminas." }
    // El agente cierra siempre con una lamina de CTA. Si el cierre es fijo, esa
    // la pone la plantilla y la del agente sobra.
    const cierre = resto.pop()
    const maximo = laminasDeContenido(plantilla.estructura)
    const contenido = resto.slice(0, maximo)
    if (contenido.length === 0) return { ok: false, error: "La pieza no trae laminas de contenido." }

    paginas = [1, ...contenido.map((_, i) => i + 2), total]
    const totalCopia = paginas.length
    valores = [
      { hook: portada.hook || portada.title || "" },
      ...contenido.map((l, i) => ({
        titulo: l.title || l.hook || "",
        cuerpo: l.body || "",
        n: String(i + 2).padStart(2, "0") + ` / ${String(totalCopia).padStart(2, "0")}`,
      })),
      estilo.cierre.modo === "agente"
        ? { titulo: cierre?.title || cierre?.hook || estilo.cierre.titulo, cuerpo: cierre?.body || estilo.cierre.texto }
        : {},
    ]
  } else {
    paginas = [1]
    const titulo = pieza.title || pieza.slides[0]?.hook || pieza.slides[0]?.title || ""
    valores = [{ titulo, hook: titulo, cuerpo: pieza.body || "" }]
  }

  // ------------------------------------------------------------ 1. copiar
  const copia = await canvaMcp<{ design?: { id: string; urls?: { edit_url?: string } } }>("CANVA_MCP_COPY_DESIGN", {
    design_id: plantilla.canva_design_id,
    ...(paginas.length < total ? { page_numbers: paginas } : {}),
  })
  if (!copia.ok) return { ok: false, error: `No se pudo copiar la plantilla: ${copia.error}` }
  const designId = copia.data.design?.id
  if (!designId) return { ok: false, error: "Canva no devolvio la copia de la plantilla." }
  const editUrl = copia.data.design?.urls?.edit_url ?? null

  // -------------------------------------------------- 2. abrir transaccion
  const tx = await canvaMcp<Transaccion>("CANVA_MCP_START_EDITING_TRANSACTION", { design_id: designId })
  if (!tx.ok) return { ok: false, error: `No se pudo abrir la copia: ${tx.error}`, designId }
  const transactionId = tx.data.transaction.transaction_id

  const cancelar = () => canvaMcp("CANVA_MCP_CANCEL_EDITING_TRANSACTION", { transaction_id: transactionId })

  // ---------------------------------------------------- 3. textos y fotos
  const operaciones: Record<string, unknown>[] = [{ type: "update_title", title: opciones.titulo.slice(0, 200) }]

  for (const t of tx.data.richtexts) {
    const original = textoDe(t)
    if (!/\{\{\w+\}\}/.test(original)) continue
    const mapa = valores[t.page_index - 1] ?? {}
    const nuevo = original.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => mapa[clave] ?? "").trim()
    // Un marcador sin valor no puede quedar a la vista: se borra el elemento.
    operaciones.push(
      nuevo ? { type: "replace_text", element_id: t.element_id, text: nuevo } : { type: "delete_element", element_id: t.element_id }
    )
  }

  const huecos = tx.data.fills
    .filter((f) => (f.alt_text?.text ?? "").trim().toLowerCase() === "foto" && f.type !== "video")
    .sort((a, b) => a.page_index - b.page_index)
    .map((f) => ({
      elementId: f.element_id,
      ancho: f.containerElement?.dimension?.width ?? 1080,
      alto: f.containerElement?.dimension?.height ?? 1350,
    }))
  const { puestas, avisos } = await ponerFotos(pieza.fotos, huecos, opciones.terminosRespaldo)
  for (const p of puestas) {
    operaciones.push({ type: "update_fill", element_id: p.elementId, asset_type: "image", asset_id: p.assetId, alt_text: p.alt.slice(0, 200) })
  }

  const edicion = await canvaMcp("CANVA_MCP_PERFORM_EDITING_OPERATIONS", {
    transaction_id: transactionId,
    page_index: 1,
    pages: tx.data.pages,
    operations: operaciones,
  }, 120_000)
  if (!edicion.ok) {
    await cancelar()
    return { ok: false, error: `Canva rechazo la edicion: ${edicion.error}`, designId }
  }

  const guardado = await canvaMcp("CANVA_MCP_COMMIT_EDITING_TRANSACTION", { transaction_id: transactionId })
  if (!guardado.ok) return { ok: false, error: `No se pudo guardar la pieza en Canva: ${guardado.error}`, designId }

  // ------------------------------------------------------------ 4. exportar
  const fmt = formatoPorId(plantilla.format)
  const exportacion = await canvaMcp<{ job?: { status?: string; urls?: string[] } }>(
    "CANVA_MCP_EXPORT_DESIGN",
    {
      design_id: designId,
      format: { type: "png", width: fmt?.formato.ancho || 1080, height: fmt?.formato.alto || 1350 },
    },
    180_000
  )
  if (!exportacion.ok) return { ok: false, error: `No se pudo exportar: ${exportacion.error}`, designId }
  const urls = exportacion.data.job?.urls ?? []
  if (urls.length === 0) return { ok: false, error: "Canva no devolvio las imagenes exportadas.", designId }

  const imagenes: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const ruta = `studio/${opciones.accountId}/${opciones.pieceId}/${String(i + 1).padStart(2, "0")}.png`
    const publica = await guardarImagen(urls[i], ruta)
    if (!publica) return { ok: false, error: `No se pudo guardar la lamina ${i + 1}.`, designId }
    imagenes.push(publica)
  }

  return { ok: true, imagenes, designId, editUrl, fotos: puestas, avisos }
}
