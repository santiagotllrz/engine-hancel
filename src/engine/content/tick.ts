import type { RawNews } from "@/lib/types"

import { todasLasCuentas } from "../accounts"
import { modelosClaude } from "../claude/modelos"
import { elegirPorHecho } from "./repetidas"
import { expirarPendientesViejas } from "./expiry"
import { getSettings } from "../schedule"
import { publishPiece, pendingToPublish } from "../publish/publish-piece"
import { decidirTanda, getPublishSchedules, marcarTanda } from "../publish/schedule"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo, parseInstagramResponse } from "../render/carousel"
import { armarPublicacionFacebook } from "../render/facebook"
import { estiloDesdeConfig } from "../render/theme"
import type { RoutineCallResult } from "../routines"
import { supabaseAdmin } from "../supabase-admin"
import {
  claimAngleJobs,
  claimInstagramJobs,
  claimLinkedinJobs,
  enqueueAngleJob,
  enqueueInstagramJob,
  enqueueLinkedinJob,
  getGenerationConfig,
  markJobUnreadable,
  MAX_DRENAJE_POR_TICK,
} from "./jobs"
import { analizarPendientes } from "./analisis"
import { procesarBuzones } from "./procesar"
import { ContentLog } from "./log"
import { parseAngleResponse, parseLinkedinResponse } from "./parse"
import type { ContentAngle, DestinoCarrusel, JobAngle, JobLinkedin, Variables } from "./types"

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

/**
 * Cuantos dias atras se miran los hechos ya publicados al buscar repeticiones.
 *
 * Una noticia solo vive cinco dias (ver `frescura.ts`), asi que en una semana
 * cabe cualquier eco tardio del mismo anuncio sin arrastrar historia que ya no
 * se va a repetir.
 */
const DIAS_DE_HECHOS_CUBIERTOS = 7

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
  facebookCreated: number
  piecesPublished: number
  failedJobs: number
  noticiasAnalizadas: number
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
  let facebookCreated = 0
  let piecesPublished = 0
  let failedJobs = 0
  let noticiasAnalizadas = 0

  const supabase = supabaseAdmin()
  log.emit("content.tick.started", "Revision de la cola de contenido", { trigger })

  // Cada cuenta tiene su propia configuracion de generacion y su propia
  // taxonomia. Se leen una vez por pasada y se guardan, porque el drenaje puede
  // traer trabajos de varias cuentas mezclados y volver a la base por cada fila
  // seria releer lo mismo decenas de veces.
  const configs = new Map<string, Awaited<ReturnType<typeof getGenerationConfig>>>()
  const configDe = async (accountId: string) => {
    const guardada = configs.get(accountId)
    if (guardada) return guardada
    const fresca = await getGenerationConfig(accountId)
    configs.set(accountId, fresca)
    return fresca
  }

  const nichos = new Map<string, string[]>()
  const nichosDe = async (accountId: string) => {
    const guardados = nichos.get(accountId)
    if (guardados) return guardados
    const frescos = await nichosConocidos(accountId)
    nichos.set(accountId, frescos)
    return frescos
  }

  const cuentas = await todasLasCuentas()
  const esManual = trigger === "manual"

  // --------------------------------------------------------------- analisis
  //
  // Antes lo hacia una rutina externa; ahora el motor investiga cada noticia con
  // busqueda web y la puntua, en tandas cortas. Va primero para que la seleccion
  // automatica de esta misma pasada pueda usar lo recien analizado. Cada cuenta
  // en su try: que una falle no frena a las demas.
  //
  // En un disparo manual (el usuario le da a "Generar" desde la interfaz) se
  // salta: solo quiere materializar lo que acaba de encolar, no arrancar un
  // analisis con busqueda web de todas las cuentas.
  if (!esManual) {
    for (const cuenta of cuentas) {
      try {
        // Una cuenta con la automatizacion apagada no se analiza: no tiene
        // sentido gastar el plan investigando noticias que no va a generar ni
        // publicar. Al reactivarla, el analisis se reanuda solo.
        if (!(await getSettings(cuenta.id)).enabled) continue

        await expirarPendientesViejas(cuenta.id)
        const res = await analizarPendientes(cuenta.id)
        noticiasAnalizadas += res.analizadas
        if (res.analizadas > 0 || res.fallidas > 0) {
          log.emit("content.analisis", `${res.analizadas} noticias analizadas`, {
            accountId: cuenta.id,
            analizadas: res.analizadas,
            fallidas: res.fallidas,
          })
        }
        for (const e of res.errores) errors.push(`[${cuenta.slug}] analisis: ${e}`)
      } catch (error) {
        errors.push(`[${cuenta.slug}] ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // En manual se procesa antes de drenar, para que lo recien encolado (un post o
  // un carrusel de un angulo ya hecho) quede materializado en la misma pasada.
  if (esManual) {
    try {
      await procesarBuzones()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  // ------------------------------------------------------------ angulos hechos
  const angleJobs = await claimAngleJobs()
  angleJobsConsumed = angleJobs.length

  for (const job of angleJobs as JobAngle[]) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.angle.failed", "La rutina marco el angulo como fallido", {
        accountId: job.account_id,
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
        accountId: job.account_id,
        jobId: job.id,
        error: message,
      })
      continue
    }

    const filas = angulos.map((angulo, index) => ({
      account_id: job.account_id,
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
        accountId: job.account_id,
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

    // En automatico se genera una pieza por cada red configurada, todas desde el
    // primer angulo que propuso la rutina; en manual esperan a que el usuario
    // elija cual convertir y para donde. Que compartan angulo es lo que hace que
    // el post y el carrusel cuenten lo mismo con distinta forma.
    //
    // `auto_networks` puede estar vacia, y entonces no se genera nada: el
    // automatico sigue sacando angulos y quedan esperando decision manual.
    const config = await configDe(job.account_id)
    if (config.generation_mode === "auto" && creados.length > 0 && config.auto_networks.length > 0) {
      const primero = creados.reduce((a, b) => (a.position <= b.position ? a : b))
      const news = (await loadNews([job.raw_news_id])).get(job.raw_news_id)
      if (news) {
        let algunaEncolada = false

        if (config.auto_networks.includes("linkedin")) {
          try {
            await enqueueLinkedinJob(primero, news, config.variables)
            linkedinQueued++
            algunaEncolada = true
            log.emit("content.linkedin.queued", "Post encolado en automatico", {
              accountId: job.account_id,
              angleId: primero.id,
            })
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }

        // Instagram y Facebook comparten trabajo: la rutina escribe un guion y
        // de el salen las piezas de las redes elegidas. Un solo encolado con
        // los destinos, en vez de uno por red, que pediria el mismo guion dos
        // veces.
        const destinos = config.auto_networks.filter(
          (red): red is DestinoCarrusel => red === "instagram" || red === "facebook"
        )
        if (destinos.length > 0) {
          try {
            await enqueueInstagramJob(primero, news, config.variables, null, destinos)
            algunaEncolada = true
            log.emit("content.instagram.queued", "Carrusel encolado en automatico", {
              accountId: job.account_id,
              angleId: primero.id,
              destinos,
            })
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }

        // Solo si algo llego a la cola: marcarlo con las dos caidas dejaria el
        // angulo en un estado que dice que se esta generando algo que no existe.
        if (algunaEncolada) {
          await supabase
            .from("content_angles")
            .update({ status: "pending_generation" })
            .eq("id", primero.id)
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
        accountId: job.account_id,
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
        accountId: job.account_id,
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
      account_id: job.account_id,
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
        accountId: job.account_id,
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
        accountId: job.account_id,
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    try {
      const news = await noticiaDelAngulo(job.content_angle_id)
      const configCuenta = await configDe(job.account_id)
      const carrusel = await generarCarrusel(
        job.id,
        job.respuesta,
        news,
        estiloDesdeConfig(configCuenta.carousel),
        await nichosDe(job.account_id)
      )

      // Un trabajo viejo no trae destinos: era solo Instagram.
      const destinos = job.input?.destinos ?? ["instagram"]

      if (destinos.includes("instagram")) {
        const { error } = await supabase.from("content_pieces").insert({
          account_id: job.account_id,
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
      }

      await supabase
        .from("content_angles")
        .update({ status: "generated" })
        .eq("id", job.content_angle_id)

      // Facebook sale del mismo guion: la portada como imagen y el texto de las
      // laminas como descripcion. Las imagenes ya estan dibujadas y subidas
      // aunque Instagram no fuera destino; a Facebook solo le hace falta la
      // primera.
      if (destinos.includes("facebook") && carrusel.images[0]) {
        const { caption, hashtags, slides } = parseInstagramResponse(job.respuesta)
        const { error: errorFacebook } = await supabase.from("content_pieces").insert({
          account_id: job.account_id,
          content_angle_id: job.content_angle_id,
          raw_news_id: news?.id ?? null,
          job_instagram_id: job.id,
          network: "facebook",
          payload: armarPublicacionFacebook({ slides, caption, hashtags, portada: carrusel.images[0] }),
          status: "generated",
          variables_usadas: (job.input?.variables ?? null) as Variables | null,
          generated_at: new Date().toISOString(),
        })
        if (errorFacebook) {
          // La de Instagram ya esta guardada; la de Facebook se puede rehacer
          // desde la interfaz. No merece tumbar el carrusel.
          errors.push(`Facebook: ${errorFacebook.message}`)
        } else {
          facebookCreated++
        }
      }

      log.emit("content.carousel.created", `Carrusel de ${carrusel.slideCount} imagenes`, {
        accountId: job.account_id,
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
        accountId: job.account_id,
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
  // El tope es por cuenta, no por pasada: si no, la primera cuenta se comeria el
  // cupo entero y las demas no arrancarian hasta que se quedara sin candidatas.

  for (const cuenta of cuentas) {
    const config = await configDe(cuenta.id)
    if (config.generation_mode !== "auto" || config.score_threshold === null) continue

    try {
      const { data: candidatas, error } = await supabase
        .from("raw_news")
        .select("*")
        .eq("account_id", cuenta.id)
        .eq("status", "analyzed")
        .gte("relevance_score", config.score_threshold)
        // El umbral solo rige para lo que entro despues de fijarlo: cambiarlo no
        // resucita noticias viejas que en su dia no llegaron.
        .gte("created_at", config.score_threshold_updated_at)
        .order("relevance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_AUTO_POR_TICK * 6)

      if (error) throw new Error(error.message)

      const noticias = (candidatas ?? []) as RawNews[]
      if (noticias.length === 0) continue

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

      const aspirantes = noticias
        .filter((n) => !vistas.has(n.id) && !n.duplicate_of_news_id)
        .slice(0, MAX_AUTO_POR_TICK)

      // Los hechos que ya tienen contenido. La ventana no es un detalle: mirar
      // solo la tanda actual dejaria pasar justo el caso que rompio esto, dos
      // posts del mismo anuncio generados con seis horas de diferencia en ticks
      // distintos. Y mirar todo el historico seria pagar un prompt enorme por
      // comparar con noticias que ya nadie va a repetir: las historias se
      // solapan durante dias, no durante meses.
      const desde = new Date(Date.now() - DIAS_DE_HECHOS_CUBIERTOS * 86_400_000).toISOString()
      const { data: cubiertas } = await supabase
        .from("raw_news")
        .select("id, title, content_angles!inner(id)")
        .eq("account_id", cuenta.id)
        .gte("created_at", desde)
        .limit(120)

      const yaCubiertas = ((cubiertas ?? []) as { id: string; title: string }[]).map((c) => ({
        id: c.id,
        title: c.title,
      }))

      const veredicto = await elegirPorHecho(
        aspirantes.map((n) => ({
          id: n.id,
          title: n.title,
          score: n.relevance_score,
          created_at: n.created_at,
        })),
        yaCubiertas,
        (await modelosClaude()).angulo
      )

      // La repetida no se borra: se marca y se enlaza con la que se quedo con el
      // hecho, para poder ver de cuantos medios salio y revisar el juicio.
      for (const [repetida, duena] of veredicto.repetidas) {
        await supabase
          .from("raw_news")
          .update({ status: "duplicate", duplicate_of_news_id: duena })
          .eq("id", repetida)
          .eq("account_id", cuenta.id)

        log.emit("content.angle.repetida", "Noticia descartada por contar un hecho ya cubierto", {
          accountId: cuenta.id,
          rawNewsId: repetida,
          mismoHechoQue: duena,
        })
      }

      const porId = new Map(aspirantes.map((n) => [n.id, n]))

      for (const elegida of veredicto.elegidas) {
        const news = porId.get(elegida.id)
        if (!news) continue
        await enqueueAngleJob(news, config.variables)
        anglesQueued++
        log.emit("content.angle.queued", "Noticia enviada al pipeline en automatico", {
          accountId: cuenta.id,
          rawNewsId: news.id,
          score: news.relevance_score,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`[${cuenta.slug}] ${message}`)
    }
  }

  // -------------------------------------------------------------- publicacion
  //
  // Se publica aqui y no al generar la pieza para que las tandas funcionen sin
  // nadie delante: el cron y los triggers pasan por esta misma pasada, y es
  // quien decide si a esta red le toca ahora.
  //

  for (const cuenta of cuentas) {
    try {
      // La zona horaria es de la cuenta: dos cuentas pueden publicar "a las
      // nueve" y no ser el mismo momento.
      const ajustes = await getSettings(cuenta.id)

      for (const programa of await getPublishSchedules(cuenta.id)) {
        const decision = decidirTanda(programa, ajustes.timezone, new Date())
        if (!decision.publicar) continue

        const piezas = await pendingToPublish(cuenta.id, programa.network, decision.cantidad)
        if (piezas.length === 0) continue

        for (const pieza of piezas) {
          const result = await publishPiece(pieza.id)
          if (result.ok) {
            piecesPublished++
            log.emit("content.piece.published", `Pieza publicada en ${programa.network}`, {
              accountId: cuenta.id,
              pieceId: pieza.id,
              urn: result.urn,
              tanda: decision.motivo,
            })
          } else {
            errors.push(result.error)
            log.emit("content.publish.failed", "No se pudo publicar", {
              accountId: cuenta.id,
              pieceId: pieza.id,
              error: result.error,
            })
          }
        }

        // Se cierra la tanda aunque alguna haya fallado: reintentarla entera
        // cinco minutos despues republicaria las que si salieron.
        await marcarTanda(cuenta.id, programa.network)
      }
    } catch (error) {
      // Cada cuenta en su propio try: que una tenga LinkedIn caducado no puede
      // impedir que las demas publiquen.
      errors.push(
        `[${cuenta.slug}] ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // --------------------------------------------------------- procesar buzones
  //
  // Los agentes de angulo, LinkedIn e Instagram: lo que antes disparaba una
  // rutina externa ahora lo hace el motor con una llamada directa a Claude.
  // Llena `respuesta` en los buzones; el drenaje de la proxima pasada lo
  // materializa igual que antes.
  try {
    const res = await procesarBuzones()
    if (res.procesadas > 0 || res.fallidas > 0) {
      log.emit("content.jobs.procesados", `${res.procesadas} trabajos procesados`, {
        procesadas: res.procesadas,
        fallidas: res.fallidas,
      })
    }
    for (const e of res.errores) errors.push(e)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
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
    facebookCreated,
    piecesPublished,
    failedJobs,
    noticiasAnalizadas,
    routines,
    errors,
  }
}

export { MAX_DRENAJE_POR_TICK }
