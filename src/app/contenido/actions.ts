"use server"

import { revalidatePath } from "next/cache"

import {
  enqueueAngleJob,
  enqueueInstagramJob,
  enqueueLinkedinJob,
  getGenerationConfig,
} from "@/engine/content/jobs"
import {
  angleRoutineConfig,
  instagramRoutineConfig,
  linkedinRoutineConfig,
} from "@/engine/content/routines"
import { runContentTick } from "@/engine/content/tick"
import type { ContentAngle, Variables } from "@/engine/content/types"
import { parseVariables, validateVariables } from "@/engine/content/variables"
import { disconnectLinkedin } from "@/engine/publish/linkedin"
import { publishPiece } from "@/engine/publish/publish-piece"
import { FUENTES, PALETAS } from "@/engine/render/theme"
import { supabaseAdmin } from "@/engine/supabase-admin"
import type { RawNews } from "@/lib/types"

/**
 * Acciones de la etapa 2.
 *
 * Todas escriben con el cliente service-role, que solo existe en el servidor: el
 * navegador manda la intencion, nunca la credencial.
 */

/** Las redes que el pipeline sabe generar hoy. */
export type Network = "linkedin" | "instagram"

/**
 * `warning` es para lo que salio bien pero no va a llegar a ninguna parte: el
 * trabajo quedo encolado y la rutina que deberia recogerlo no esta montada.
 * Decir que fue un error seria mentir; callarlo dejaria al usuario esperando.
 */
export type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/contenido")
  revalidatePath("/contenido/config")
  revalidatePath("/contenido/cola")
  revalidatePath("/noticias")
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim()
}

/** Lee del formulario solo las ranuras presentes, para un override puntual. */
function overrideFromForm(form: FormData): Partial<Variables> | null {
  const claves: (keyof Variables)[] = [
    "tono",
    "audiencia",
    "voz_marca",
    "cta",
    "evitar",
    "longitud",
    "idioma",
  ]
  const override: Partial<Variables> = {}
  for (const clave of claves) {
    const valor = form.get(clave)
    if (typeof valor === "string" && valor.trim().length > 0) {
      override[clave] = valor.trim()
    }
  }
  return Object.keys(override).length > 0 ? override : null
}

/** El aviso de que nadie va a recoger lo que se acaba de encolar. */
function avisoSiFaltaRutina(cual: "angle" | Network): string | undefined {
  if (cual === "angle" && angleRoutineConfig() === null) {
    return (
      "Encolado, pero la rutina de angulo no esta configurada " +
      "(ANGLE_ROUTINE_URL / ANGLE_ROUTINE_TOKEN): se quedara pendiente."
    )
  }
  if (cual === "linkedin" && linkedinRoutineConfig() === null) {
    return (
      "Encolado, pero la rutina de LinkedIn no esta configurada " +
      "(LINKEDIN_ROUTINE_URL / LINKEDIN_ROUTINE_TOKEN): se quedara pendiente."
    )
  }
  if (cual === "instagram" && instagramRoutineConfig() === null) {
    return (
      "Encolado, pero la rutina de Instagram no esta configurada " +
      "(INSTAGRAM_ROUTINE_URL / INSTAGRAM_ROUTINE_TOKEN): se quedara pendiente."
    )
  }
  return undefined
}

async function loadNews(id: string): Promise<RawNews> {
  const { data, error } = await supabaseAdmin().from("raw_news").select("*").eq("id", id).single()
  if (error) throw new Error(`No se encontro la noticia: ${error.message}`)
  return data as RawNews
}

// -------------------------------------------------------------- envio manual

/**
 * Manda una noticia al pipeline.
 *
 * Disponible siempre, en cualquier modo y sin importar el umbral: es una accion
 * del usuario, no de la seleccion automatica.
 */
export async function sendToPipeline(rawNewsId: string): Promise<ActionResult> {
  if (!rawNewsId) return { ok: false, error: "Falta el id de la noticia." }

  try {
    const [news, config] = await Promise.all([loadNews(rawNewsId), getGenerationConfig()])
    await enqueueAngleJob(news, config.variables)
    // La rutina no espera al webhook para trabajar, pero el tick tambien drena
    // lo que ya estuviera hecho y avisa a las dos rutinas de una vez.
    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true, warning: avisoSiFaltaRutina("angle") }
  } catch (error) {
    return fail(error, "No se pudo enviar la noticia al pipeline.")
  }
}

/** Igual, pero con ranuras sobreescritas solo para esta generacion. */
export async function sendToPipelineWithOverride(form: FormData): Promise<ActionResult> {
  const rawNewsId = text(form, "raw_news_id")
  if (!rawNewsId) return { ok: false, error: "Falta el id de la noticia." }

  const override = overrideFromForm(form)
  const invalido = override ? validateVariables(override as Record<string, unknown>) : null
  if (invalido) return { ok: false, error: invalido }

  try {
    const [news, config] = await Promise.all([loadNews(rawNewsId), getGenerationConfig()])
    await enqueueAngleJob(news, config.variables, override)
    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true, warning: avisoSiFaltaRutina("angle") }
  } catch (error) {
    return fail(error, "No se pudo enviar la noticia al pipeline.")
  }
}

// ------------------------------------------------------------------- angulos

/** Promueve un angulo a contenido de la red elegida. */
export async function generateFromAngle(
  angleId: string,
  network: Network = "linkedin",
  form?: FormData
): Promise<ActionResult> {
  if (!angleId) return { ok: false, error: "Falta el id del angulo." }
  if (network !== "linkedin" && network !== "instagram") {
    return { ok: false, error: "Red no soportada." }
  }

  const override = form ? overrideFromForm(form) : null
  const invalido = override ? validateVariables(override as Record<string, unknown>) : null
  if (invalido) return { ok: false, error: invalido }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from("content_angles")
      .select("*")
      .eq("id", angleId)
      .single()

    if (error) throw new Error(error.message)
    const angle = data as ContentAngle

    const [news, config] = await Promise.all([loadNews(angle.raw_news_id), getGenerationConfig()])

    // El mismo angulo alimenta las dos redes: esa es la razon de que el angulo
    // se decida una sola vez y por separado.
    if (network === "instagram") {
      await enqueueInstagramJob(angle, news, config.variables, override)
    } else {
      await enqueueLinkedinJob(angle, news, config.variables, override)
    }

    // Solo se marca a la espera si no habia nada generado aun; si ya hay una
    // pieza de la otra red, el angulo se queda en 'generated' y no retrocede.
    if (angle.status === "angled") {
      await supabase
        .from("content_angles")
        .update({ status: "pending_generation" })
        .eq("id", angleId)
    }

    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true, warning: avisoSiFaltaRutina(network) }
  } catch (error) {
    return fail(error, "No se pudo generar el contenido.")
  }
}

export async function discardAngle(angleId: string): Promise<ActionResult> {
  if (!angleId) return { ok: false, error: "Falta el id del angulo." }

  try {
    const { error } = await supabaseAdmin()
      .from("content_angles")
      .update({ status: "discarded" })
      .eq("id", angleId)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo descartar el angulo.")
  }
}

// -------------------------------------------------------------------- piezas

async function setPieceStatus(
  pieceId: string,
  status: "approved" | "rejected"
): Promise<ActionResult> {
  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }

  try {
    const { error } = await supabaseAdmin()
      .from("content_pieces")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", pieceId)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado de la pieza.")
  }
}

export async function approvePiece(pieceId: string): Promise<ActionResult> {
  return setPieceStatus(pieceId, "approved")
}

export async function rejectPiece(pieceId: string): Promise<ActionResult> {
  return setPieceStatus(pieceId, "rejected")
}

/** Guarda el texto editado a mano. La revision vive dentro de Hancel. */
export async function updatePiece(form: FormData): Promise<ActionResult> {
  const pieceId = text(form, "piece_id")
  const body = text(form, "body")

  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }
  if (!body) return { ok: false, error: "El cuerpo del post no puede quedar vacio." }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from("content_pieces")
      .select("payload")
      .eq("id", pieceId)
      .single()

    if (error) throw new Error(error.message)

    const payload = { ...((data as { payload: object }).payload ?? {}) }
    const hook = text(form, "hook")
    const actualizado = { ...payload, body, hook: hook || null }

    const { error: errorUpdate } = await supabase
      .from("content_pieces")
      .update({ payload: actualizado })
      .eq("id", pieceId)

    if (errorUpdate) throw new Error(errorUpdate.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la pieza.")
  }
}

// ---------------------------------------------------------------- publicacion

/** Publica una pieza a mano. El automatico hace lo mismo desde el tick. */
export async function publishPieceNow(pieceId: string): Promise<ActionResult> {
  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }

  const result = await publishPiece(pieceId)
  refresh()
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function disconnectLinkedinAccount(): Promise<ActionResult> {
  try {
    await disconnectLinkedin()
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo desconectar la cuenta.")
  }
}

// -------------------------------------------------------------------- la cola

/**
 * Reencola un buzon fallido como uno nuevo.
 *
 * Sin reintento automatico a proposito: un prompt que falla reintentado en bucle
 * quema cuota sin converger. El usuario mira el error y decide.
 */
export async function retryJob(
  tabla: "jobs_angle" | "jobs_linkedin" | "jobs_instagram",
  jobId: string
): Promise<ActionResult> {
  if (!jobId) return { ok: false, error: "Falta el id del trabajo." }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .eq("id", jobId)
      .single()

    if (error) throw new Error(error.message)
    const job = data as Record<string, unknown>

    // Dos inserts separados y no uno con la fila armada aparte: cada buzon
    // tiene su clave foranea propia y supabase-js no tipa una union de formas.
    const errorInsert =
      tabla === "jobs_angle"
        ? (
            await supabase.from("jobs_angle").insert({
              raw_news_id: job.raw_news_id as string,
              input: job.input,
            })
          ).error
        : (
            await supabase.from(tabla).insert({
              content_angle_id: job.content_angle_id as string,
              input: job.input,
            })
          ).error

    if (errorInsert) throw new Error(errorInsert.message)

    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo reintentar el trabajo.")
  }
}

/** "Revisar la cola ahora": la misma pasada que disparan los triggers. */
export async function runTickNow(): Promise<ActionResult> {
  try {
    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo revisar la cola.")
  }
}

// ------------------------------------------------------------- configuracion

/** Cuando y cuanto se publica en una red. */
export async function updatePublishSchedule(form: FormData): Promise<ActionResult> {
  const network = text(form, "network")
  if (network !== "linkedin" && network !== "instagram") {
    return { ok: false, error: "Red no soportada." }
  }

  const horas = [
    ...new Set(
      String(form.get("run_hours") ?? "")
        .split(",")
        .map((parte) => Number(parte.trim()))
        .filter((valor) => Number.isInteger(valor) && valor >= 0 && valor <= 23)
    ),
  ].sort((a, b) => a - b)

  const minuto = Number(text(form, "run_minute") || "0")
  const tanda = Number(text(form, "batch_size") || "1")

  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
    return { ok: false, error: "El minuto tiene que estar entre 0 y 59." }
  }
  if (!Number.isInteger(tanda) || tanda < 1 || tanda > 20) {
    return { ok: false, error: "Las piezas por tanda van de 1 a 20." }
  }

  try {
    const { error } = await supabaseAdmin()
      .from("publish_schedule")
      .update({
        enabled: form.get("enabled") === "true",
        run_hours: horas,
        run_minute: minuto,
        batch_size: tanda,
        updated_at: new Date().toISOString(),
      })
      .eq("network", network)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la programacion.")
  }
}

/** El aspecto de las imagenes del carrusel. Cambia como se ve, no que dice. */
export async function updateCarouselStyle(form: FormData): Promise<ActionResult> {
  const paleta = text(form, "paleta")
  const fuente = text(form, "fuente")

  if (!(paleta in PALETAS)) return { ok: false, error: "Esa paleta no existe." }
  if (!(fuente in FUENTES)) return { ok: false, error: "Esa tipografia no existe." }

  const marca = text(form, "marca").slice(0, 40)

  try {
    const { error } = await supabaseAdmin()
      .from("generation_config")
      .update({
        carousel: {
          paleta,
          fuente,
          marca,
          mostrarPaginacion: form.get("mostrarPaginacion") === "true",
          usarFotos: form.get("usarFotos") === "true",
          cierre: {
            activo: form.get("cierreActivo") === "true",
            titulo: text(form, "cierreTitulo").slice(0, 40),
            texto: text(form, "cierreTexto").slice(0, 140),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el aspecto.")
  }
}

export async function updateGenerationConfig(form: FormData): Promise<ActionResult> {
  const variables = {
    tono: text(form, "tono"),
    audiencia: text(form, "audiencia"),
    voz_marca: text(form, "voz_marca"),
    cta: text(form, "cta"),
    evitar: text(form, "evitar"),
    longitud: text(form, "longitud"),
    idioma: text(form, "idioma"),
  }

  const invalido = validateVariables(variables)
  if (invalido) return { ok: false, error: invalido }

  const modo = text(form, "generation_mode") || "manual"
  if (modo !== "auto" && modo !== "manual") {
    return { ok: false, error: "El modo tiene que ser automatico o manual." }
  }

  // Vacio = sin umbral: el modo automatico no selecciona nada hasta que se
  // defina, que es justo lo que se quiere mientras no haya criterio de scoring.
  const umbralTexto = text(form, "score_threshold")
  let umbral: number | null = null
  if (umbralTexto.length > 0) {
    umbral = Number(umbralTexto)
    if (!Number.isInteger(umbral) || umbral < 0 || umbral > 10) {
      return { ok: false, error: "El umbral tiene que ser un entero entre 0 y 10." }
    }
  }

  if (modo === "auto" && umbral === null) {
    return {
      ok: false,
      error: "Para activar el modo automatico hay que definir primero el umbral de score.",
    }
  }

  try {
    const { error } = await supabaseAdmin()
      .from("generation_config")
      .update({
        variables: parseVariables(variables),
        score_threshold: umbral,
        generation_mode: modo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la configuracion.")
  }
}
