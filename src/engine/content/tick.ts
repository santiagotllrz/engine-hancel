import type { RawNews } from "@/lib/types"

import { publishPiece, pendingToPublish } from "../publish/publish-piece"
import { decidirTanda, getPublishSchedules, marcarTanda } from "../publish/schedule"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo } from "../render/carousel"
import { estiloDesdeConfig } from "../render/theme"
import type { RoutineCallResult } from "../routines"
import { supabaseAdmin } from "../supabase-admin"
import {
  claimAngleJobs,
  claimInstagramJobs,
  claimLinkedinJobs,
  countPending,
  enqueueAngleJob,
  enqueueLinkedinJob,
  getGenerationConfig,
  markJobUnreadable,
  MAX_DRENAJE_POR_TICK,
} from "./jobs"
import { ContentLog } from "./log"
import { parseAngleResponse, parseLinkedinResponse } from "./parse"
import { fireAngleRoutine, fireInstagramRoutine, fireLinkedinRoutine } from "./routines"
import type { ContentAngle, JobAngle, JobLinkedin, Variables } from "./types"

/**
 * Una pasada del pipeline de contenido.
 *
 * El mismo patron buzon, aplicado a la aplicacion: los triggers de Postgres, el
 * cron de respaldo y los botones de la interfaz no traen trabajo, solo dicen
 * "despierta y revisa la cola". Todos llaman aqui.
 *
 * La pasada es idempotente y convergente: toma lo que este hecho y sin
 * consumir, lo materializa, encadena lo que toque y sale. Dos pasadas
 * solapadas no duplican nada porque el drenaje reclama las filas con un
 * compare-and-set (ver `claimAngleJobs` en `jobs.ts`), y una pasada en vacio no
 * cuesta casi nada.
 */

/**
 * Tope de noticias que el modo automatico encola por pasada.
 *
 * Es un limite tecnico, no editorial: sin el, activar el modo automatico con un
 * umbral bajo intentaria encolar cientos de trabajos en una sola peticion y
 * agotaria el tiempo de la funcion. Como el tick vuelve a correr con cada
 * trigger y cada cinco minutos por cron, lo que no entra ahora entra despues.
 */
export const MAX_AUTO_POR_TICK = 5

/** Tope de publicaciones por pasada: LinkedIn limita el ritmo y no hay prisa. */
export const MAX_PUBLICAR_POR_TICK = 3

export type TickTrigger = "trigger" | "cron" | "manual" | "app"

export type TickSummary = {
  startedAt: string
  durationMs: number
  trigger: TickTrigger
  anglesQueued: number
  angleJobsConsumed: number
  anglesCreated: number
  linkedinQueued: number
  linkedinJobsConsumed: number
  piecesCreated: number
  instagramJobsConsumed: number
  carouselsCreated: number
  piecesPublished: number
  failedJobs: number
  routines: RoutineCallResult[]
  errors: string[]
}

async function loadNews(ids: string[]): Promise<Map<string, RawNews>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabaseAdmin().from("raw_news").select("*").in("id", ids)
  if (error) throw new Error(`No se pudieron leer las noticias: ${error.message}`)
  return new Map(((data ?? []) as RawNews[]).map((row) => [row.id, row]))
}

export async function runContentTick(
  options: { trigger?: TickTrigger; signal?: AbortSignal } = {}
): Promise<TickSummary> {
  const trigger = options.trigger ?? "manual"
  const started = new Date()
  const log = new ContentLog()
  const errors: string[] = []
  const routines: RoutineCallResult[] = []

  let anglesQueued = 0
  let angleJobsConsumed = 0
  let anglesCreated = 0
  let linkedinQueued = 0
  let linkedinJobsConsumed = 0
  let piecesCreated = 0
  let instagramJobsConsumed = 0
  let carouselsCreated = 0
  let piecesPublished = 0
  let failedJobs = 0

  const supabase = supabaseAdmin()
  const config = await getGenerationConfig()
  log.emit("content.tick.started", "Revision de la cola de contenido", { trigger })

  // ------------------------------------------------------------ angulos hechos
  const angleJobs = await claimAngleJobs()
  angleJobsConsumed = angleJobs.length

  for (const job of angleJobs as JobAngle[]) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.angle.failed", "La rutina marco el angulo como fallido", {
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    let angulos
    try {
      angulos = parseAngleResponse(job.respuesta)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_angle", job.id, message)
      log.emit("content.angle.failed", "Respuesta de angulo ilegible", {
        jobId: job.id,
        error: message,
      })
      continue
    }

    const filas = angulos.map((angulo, index) => ({
      raw_news_id: job.raw_news_id,
      job_angle_id: job.id,
      angle: angulo.angle,
      thesis: angulo.thesis,
      playbook_format: angulo.playbook_format,
      position: index,
    }))

    const { data, error } = await supabase.from("content_angles").insert(filas).select("*")
    if (error) {
      errors.push(error.message)
      log.emit("content.angle.failed", "No se pudieron guardar los angulos", {
        jobId: job.id,
        error: error.message,
      })
      continue
    }

    const creados = (data ?? []) as ContentAngle[]
    anglesCreated += creados.length
    log.emit("content.angle.created", `${creados.length} angulos guardados`, {
      jobId: job.id,
      rawNewsId: job.raw_news_id,
    })

    // En automatico se genera el post del primero que propuso la rutina; en
    // manual esperan a que el usuario elija cual convertir.
    if (config.generation_mode === "auto" && creados.length > 0) {
      const primero = creados.reduce((a, b) => (a.position <= b.position ? a : b))
      const news = (await loadNews([job.raw_news_id])).get(job.raw_news_id)
      if (news) {
        try {
          await enqueueLinkedinJob(primero, news, config.variables)
          await supabase
            .from("content_angles")
            .update({ status: "pending_generation" })
            .eq("id", primero.id)
          linkedinQueued++
          log.emit("content.linkedin.queued", "Post encolado en automatico", {
            angleId: primero.id,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errors.push(message)
        }
      }
    }
  }

  // ------------------------------------------------------------- posts hechos
  const linkedinJobs = await claimLinkedinJobs()
  linkedinJobsConsumed = linkedinJobs.length

  for (const job of linkedinJobs as JobLinkedin[]) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.linkedin.failed", "La rutina marco el post como fallido", {
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    let post
    try {
      post = parseLinkedinResponse(job.respuesta)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_linkedin", job.id, message)
      log.emit("content.linkedin.failed", "Respuesta de post ilegible", {
        jobId: job.id,
        error: message,
      })
      continue
    }

    const { data: angleRow } = await supabase
      .from("content_angles")
      .select("id, raw_news_id")
      .eq("id", job.content_angle_id)
      .maybeSingle()

    const variablesUsadas = (job.input?.variables ?? null) as Variables | null

    const { error } = await supabase.from("content_pieces").insert({
      content_angle_id: job.content_angle_id,
      raw_news_id: (angleRow as { raw_news_id: string } | null)?.raw_news_id ?? null,
      job_linkedin_id: job.id,
      network: "linkedin",
      payload: post,
      status: "generated",
      variables_usadas: variablesUsadas,
      generated_at: new Date().toISOString(),
    })

    if (error) {
      errors.push(error.message)
      log.emit("content.linkedin.failed", "No se pudo guardar la pieza", {
        jobId: job.id,
        error: error.message,
      })
      continue
    }

    piecesCreated++
    await supabase
      .from("content_angles")
      .update({ status: "generated" })
      .eq("id", job.content_angle_id)

    log.emit("content.piece.created", "Pieza de LinkedIn generada", {
      jobId: job.id,
      angleId: job.content_angle_id,
    })
  }

  // -------------------------------------------------------- carruseles hechos
  //
  // Instagram tiene un paso mas que LinkedIn: ademas de leer la respuesta hay
  // que dibujar las imagenes y subirlas. Ese trabajo puede fallar por motivos
  // ajenos al texto —una foto caida, el storage— y por eso va en su propio
  // try/catch: un carrusel roto no puede llevarse por delante la pasada.
  const instagramJobs = await claimInstagramJobs()
  instagramJobsConsumed = instagramJobs.length

  for (const job of instagramJobs) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.instagram.failed", "La rutina marco el carrusel como fallido", {
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    try {
      const news = await noticiaDelAngulo(job.content_angle_id)
      const [nichos] = await Promise.all([nichosConocidos()])
      const carrusel = await generarCarrusel(
        job.id,
        job.respuesta,
        news,
        estiloDesdeConfig(config.carousel),
        nichos
      )

      const { error } = await supabase.from("content_pieces").insert({
        content_angle_id: job.content_angle_id,
        raw_news_id: news?.id ?? null,
        job_instagram_id: job.id,
        network: "instagram",
        payload: carrusel,
        status: "generated",
        variables_usadas: (job.input?.variables ?? null) as Variables | null,
        generated_at: new Date().toISOString(),
      })

      if (error) throw new Error(error.message)

      carouselsCreated++
      await supabase
        .from("content_angles")
        .update({ status: "generated" })
        .eq("id", job.content_angle_id)

      log.emit("content.carousel.created", `Carrusel de ${carrusel.slideCount} imagenes`, {
        jobId: job.id,
        slides: carrusel.slideCount,
        portadaSinFoto: carrusel.portadaSinFoto,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_instagram", job.id, message)
      log.emit("content.instagram.failed", "No se pudo generar el carrusel", {
        jobId: job.id,
        error: message,
      })
    }
  }

  // ------------------------------------------------------- seleccion automatica
  //
  // Sin umbral definido no se selecciona nada: el scoring lo decide el usuario
  // desde la interfaz, y encolar con un criterio inventado seria peor que no
  // encolar. El envio manual sigue disponible siempre, al margen de esto.
  if (config.generation_mode === "auto" && config.score_threshold !== null) {
    try {
      const { data: candidatas, error } = await supabase
        .from("raw_news")
        .select("*")
        .eq("status", "analyzed")
        .gte("relevance_score", config.score_threshold)
        .order("relevance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_AUTO_POR_TICK * 6)

      if (error) throw new Error(error.message)

      const noticias = (candidatas ?? []) as RawNews[]
      if (noticias.length > 0) {
        // Las que ya pasaron por el pipeline no vuelven a entrar.
        const { data: yaEncoladas } = await supabase
          .from("jobs_angle")
          .select("raw_news_id")
          .in(
            "raw_news_id",
            noticias.map((n) => n.id)
          )

        const vistas = new Set(
          ((yaEncoladas ?? []) as { raw_news_id: string }[]).map((row) => row.raw_news_id)
        )

        for (const news of noticias.filter((n) => !vistas.has(n.id)).slice(0, MAX_AUTO_POR_TICK)) {
          await enqueueAngleJob(news, config.variables)
          anglesQueued++
          log.emit("content.angle.queued", "Noticia enviada al pipeline en automatico", {
            rawNewsId: news.id,
            score: news.relevance_score,
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(message)
    }
  }

  // -------------------------------------------------------------- publicacion
  //
  // Se publica aqui y no al generar la pieza para que las tandas funcionen sin
  // nadie delante: el cron y los triggers pasan por esta misma pasada, y es
  // quien decide si a esta red le toca ahora.
  //
  try {
    const { getSettings } = await import("../schedule")
    const ajustes = await getSettings()

    for (const programa of await getPublishSchedules()) {
      const decision = decidirTanda(programa, ajustes.timezone, new Date())
      if (!decision.publicar) continue

      const piezas = await pendingToPublish(programa.network, decision.cantidad)
      if (piezas.length === 0) continue

      for (const pieza of piezas) {
        const result = await publishPiece(pieza.id)
        if (result.ok) {
          piecesPublished++
          log.emit("content.piece.published", `Pieza publicada en ${programa.network}`, {
            pieceId: pieza.id,
            urn: result.urn,
            tanda: decision.motivo,
          })
        } else {
          errors.push(result.error)
          log.emit("content.publish.failed", "No se pudo publicar", {
            pieceId: pieza.id,
            error: result.error,
          })
        }
      }

      // Se cierra la tanda aunque alguna haya fallado: reintentarla entera cinco
      // minutos despues republicaria las que si salieron.
      await marcarTanda(programa.network)
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  // ------------------------------------------------------------------- avisos
  //
  // Un aviso por rutina y por pasada, y solo si hay algo esperando: el webhook
  // es "revisa la cola", asi que dispararlo dos veces seguidas no aporta nada.
  for (const [tabla, disparar] of [
    ["jobs_angle", fireAngleRoutine],
    ["jobs_linkedin", fireLinkedinRoutine],
    ["jobs_instagram", fireInstagramRoutine],
  ] as const) {
    try {
      const pendientes = await countPending(tabla)
      if (pendientes === 0) continue

      const result = await disparar(pendientes, options.signal)
      routines.push(result)
      if (result.ok) {
        log.emit("content.routine.called", `${result.routine} disparada`, { pendientes })
      } else {
        log.emit("content.routine.failed", `${result.routine} fallo`, { error: result.error })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const durationMs = Date.now() - started.getTime()
  log.emit("content.tick.completed", "Revision terminada", {
    anglesCreated,
    piecesCreated,
    carouselsCreated,
    anglesQueued,
    linkedinQueued,
    durationMs,
  })
  await log.flush()

  return {
    startedAt: started.toISOString(),
    durationMs,
    trigger,
    anglesQueued,
    angleJobsConsumed,
    anglesCreated,
    linkedinQueued,
    linkedinJobsConsumed,
    piecesCreated,
    instagramJobsConsumed,
    carouselsCreated,
    piecesPublished,
    failedJobs,
    routines,
    errors,
  }
}

export { MAX_DRENAJE_POR_TICK }
