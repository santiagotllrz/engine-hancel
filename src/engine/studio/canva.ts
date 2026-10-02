import { claveComposio, COMPOSIO_USER, estadoCanva } from "./canva-conexion"

/**
 * Generacion de imagenes con Canva, via Composio.
 *
 * El estilo lo fija una brand template de Canva: una plantilla con campos. El
 * agente no dibuja, solo rellena esos campos (autofill) y exporta el resultado
 * a PNG. Asi el estilo sale igual cada vez —es la plantilla, no el modelo— y lo
 * unico que cambia es el texto y las imagenes de cada pieza.
 *
 * El flujo son cuatro pasos contra Canva, dos de ellos jobs asincronos que hay
 * que sondear:
 *   1. autofill  -> job
 *   2. status    -> espera a que el diseno este hecho
 *   3. export    -> job
 *   4. result    -> las urls de las imagenes
 *
 * Necesita Canva conectado (boton en Configuracion > Conexiones) y una brand
 * template creada. El flujo completo se prueba con esa plantilla puesta.
 */

const BASE = "https://backend.composio.dev/api/v3.1/tools/execute"
const TIMEOUT_MS = 45_000

type Ejecucion = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

/** Ejecuta una herramienta de Canva y devuelve su `data`. */
async function ejecutar(
  clave: string,
  cuenta: string,
  tool: string,
  args: Record<string, unknown>
): Promise<Ejecucion> {
  try {
    const res = await fetch(`${BASE}/${tool}`, {
      method: "POST",
      headers: { "x-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: COMPOSIO_USER, connected_account_id: cuenta, arguments: args }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const json = (await res.json().catch(() => null)) as {
      successful?: boolean
      error?: string
      data?: Record<string, unknown>
    } | null

    if (!res.ok || !json || json.successful === false) {
      return { ok: false, error: json?.error || `Canva ${tool} respondio ${res.status}` }
    }
    return { ok: true, data: json.data ?? {} }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Sondea un job hasta que termina, sin pasarse del presupuesto de tiempo. */
async function sondear(
  clave: string,
  cuenta: string,
  tool: string,
  args: Record<string, unknown>,
  leerEstado: (data: Record<string, unknown>) => { hecho: boolean; fallo: boolean; data: Record<string, unknown> }
): Promise<Ejecucion> {
  // Hasta ~40s por job: los disenos de Canva tardan segundos, no minutos.
  for (let intento = 0; intento < 20; intento++) {
    const r = await ejecutar(clave, cuenta, tool, args)
    if (!r.ok) return r
    const estado = leerEstado(r.data)
    if (estado.fallo) return { ok: false, error: `El job de Canva fallo (${tool}).` }
    if (estado.hecho) return { ok: true, data: estado.data }
    await new Promise((res) => setTimeout(res, 2000))
  }
  return { ok: false, error: `El job de Canva no termino a tiempo (${tool}).` }
}

export type ResultadoCanva = { ok: true; imagenes: string[]; designId: string } | { ok: false; error: string }

/**
 * Rellena una brand template y exporta el diseno a imagenes.
 *
 * `campos` es el mapeo del dataset de la plantilla: para cada campo, su texto o
 * el asset de imagen. La forma la define Canva:
 *   { titular: { type: "text", text: "..." }, foto: { type: "image", asset_id } }
 */
export async function generarConCanva(
  brandTemplateId: string,
  campos: Record<string, unknown>,
  titulo: string
): Promise<ResultadoCanva> {
  const clave = await claveComposio()
  if (!clave) return { ok: false, error: "Falta la clave de Composio." }
  // La cuenta conectada se busca cada vez: si reconectas Canva, cambia de id, y
  // tenerla copiada en algun sitio la dejaria apuntando a una conexion muerta.
  const estado = await estadoCanva()
  if (!estado.conectado) return { ok: false, error: `Canva: ${estado.motivo} Conectalo en Configuracion > Conexiones.` }
  const cuenta = estado.connectedAccountId
  if (!brandTemplateId) return { ok: false, error: "La receta no tiene brand template de Canva." }

  // 1. Autofill: crea el job que rellena la plantilla.
  const inicio = await ejecutar(clave, cuenta, "CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB", {
    brand_template_id: brandTemplateId,
    title: titulo.slice(0, 255),
    data: campos,
  })
  if (!inicio.ok) return inicio
  const jobId = leerId(inicio.data, ["job", "id"]) ?? leerId(inicio.data, ["id"])
  if (!jobId) return { ok: false, error: "Canva no devolvio el id del job de autofill." }

  // 2. Espera al diseno.
  const relleno = await sondear(
    clave,
    cuenta,
    "CANVA_RETRIEVE_DESIGN_AUTOFILL_JOB_STATUS",
    { jobId },
    (d) => {
      const job = (d.job ?? d) as Record<string, unknown>
      const status = String(job.status ?? "")
      return { hecho: status === "success", fallo: status === "failed", data: job }
    }
  )
  if (!relleno.ok) return relleno
  const designId = leerId(relleno.data, ["result", "design", "id"]) ?? leerId(relleno.data, ["design", "id"])
  if (!designId) return { ok: false, error: "Canva no devolvio el id del diseno." }

  // 3. Export: crea el job que saca las imagenes.
  const exportInicio = await ejecutar(clave, cuenta, "CANVA_INITIATES_CANVA_DESIGN_EXPORT_JOB", {
    design_id: designId,
  })
  if (!exportInicio.ok) return exportInicio
  const exportId = leerId(exportInicio.data, ["job", "id"]) ?? leerId(exportInicio.data, ["id"])
  if (!exportId) return { ok: false, error: "Canva no devolvio el id del export." }

  // 4. Espera las urls.
  const resultado = await sondear(
    clave,
    cuenta,
    "CANVA_GET_DESIGN_EXPORT_JOB_RESULT",
    { exportId },
    (d) => {
      const job = (d.job ?? d) as Record<string, unknown>
      const status = String(job.status ?? "")
      return { hecho: status === "success", fallo: status === "failed", data: job }
    }
  )
  if (!resultado.ok) return resultado

  const urls = extraerUrls(resultado.data)
  if (urls.length === 0) return { ok: false, error: "Canva no devolvio imagenes exportadas." }

  return { ok: true, imagenes: urls, designId }
}

/** Baja por un camino de claves, devolviendo el primer string que encuentre. */
function leerId(data: Record<string, unknown>, camino: string[]): string | null {
  let actual: unknown = data
  for (const clave of camino) {
    if (actual && typeof actual === "object" && clave in (actual as Record<string, unknown>)) {
      actual = (actual as Record<string, unknown>)[clave]
    } else {
      return null
    }
  }
  return typeof actual === "string" ? actual : null
}

/** Las urls de las imagenes exportadas, vengan como vengan anidadas. */
function extraerUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = []
  const visitar = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//.test(v)) urls.push(v)
    else if (Array.isArray(v)) v.forEach(visitar)
    else if (v && typeof v === "object") Object.values(v).forEach(visitar)
  }
  visitar(data.urls ?? data)
  return [...new Set(urls)]
}
