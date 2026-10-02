import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import { dayIn, hourIn } from "../schedule"
import { corregirTextos } from "./ortografia"
import { generarConCanva } from "./canva"
import { studioConfig } from "./settings"

/**
 * El agente de contenido: convierte cartuchos en piezas.
 *
 * Un cartucho es una idea que dejo el agente de ideas. Este agente la toma, la
 * desarrolla en una pieza para el canal y el formato de una receta, y la guarda
 * en `studio_pieces`. Si la receta usa Canva y tiene una plantilla configurada,
 * ademas dibuja la pieza; si no, la deja como texto listo, a la espera de que se
 * configure la plantilla (la ultima capa).
 *
 * Dos cosas lo hacen seguro de correr en paralelo:
 * - Los cartuchos se reclaman con `reclamar_cartuchos`, que hace el UPDATE con
 *   FOR UPDATE SKIP LOCKED: dos pasadas no pueden llevarse el mismo.
 * - Cada receta tiene un presupuesto por dia (per_day) y un candado por hora
 *   (last_run_at), asi que ni produce de mas ni repite la tanda de una hora.
 */

/** A que familia de salida pertenece cada formato. Decide que campos se rellenan. */
function familiaDeFormato(formatId: string): "laminas" | "imagen" | "texto" {
  if (["ig_carrusel", "fb_carrusel", "li_documento"].includes(formatId)) return "laminas"
  if (["ig_post", "fb_post", "li_texto_imagen", "ig_historia"].includes(formatId)) return "imagen"
  // li_texto y los formatos de video (que por ahora salen como guion en parrafos).
  return "texto"
}

export type Receta = {
  id: string
  account_id: string
  pillar_id: string
  name: string
  channel: string
  format: string
  generator: string
  template: { brand_template_id?: string; campos?: Record<string, string> } | null
  per_day: number
  run_at: number[]
  enabled: boolean
  last_run_at: string | null
}

type CartuchoFila = {
  id: string
  pillar_id: string
  topic_id: string | null
  subtopic_id: string | null
  intent_id: string | null
  narrative_id: string | null
  idea: string
  notes: string | null
}

/** El contexto de capas que se le da al agente, resuelto a nombres y descripciones. */
type Contexto = {
  tema: string | null
  subtema: string | null
  intencion: { name: string; description: string | null } | null
  narrativa: { name: string; description: string | null } | null
  cta: string | null
}

type PiezaPayload = {
  familia: "laminas" | "imagen" | "texto"
  caption: string
  hashtags: string[]
  fotos: string[]
  elemento: string
  slides: { n: number; type: string; hook?: string; title?: string; body?: string }[]
  title: string
  body: string
  parrafos: string[]
}

/** Pide a Claude la pieza y la normaliza a una forma estable. */
async function redactar(
  cartucho: CartuchoFila,
  ctx: Contexto,
  formatId: string,
  system: string,
  model: string
): Promise<{ payload: PiezaPayload; uso: UsoClaude }> {
  const familia = familiaDeFormato(formatId)

  // Las etiquetas van acentuadas: el modelo imita como estan escritas las
  // instrucciones, y unas etiquetas sin tildes tambien se contagian.
  const prompt = `IDEA
- idea: ${cartucho.idea}
- nota: ${cartucho.notes ?? "(sin nota)"}

CAPAS
- tema: ${ctx.tema ?? "(sin tema)"}${ctx.subtema ? ` | subtema: ${ctx.subtema}` : ""}
- intención: ${ctx.intencion?.name ?? "(sin intención)"}${ctx.intencion?.description ? ` (${ctx.intencion.description})` : ""}
- narrativa: ${ctx.narrativa?.name ?? "(sin narrativa)"}${ctx.narrativa?.description ? ` (${ctx.narrativa.description})` : ""}
- cta: ${ctx.cta ?? "(sin cta)"}

FORMATO
- familia: ${familia}
- formato: ${formatId}

Recuerda: todo lo que escribas lleva sus tildes y sus eñes, aunque la idea de arriba venga sin ellas.`

  const r = await llamarClaude({ model, system, prompt, maxTokens: 3600 })
  if (!r.ok) throw new Error(r.error)

  const bruto = parsearJSONDeClaude(r.texto) as Record<string, unknown>
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

  const slides = Array.isArray(bruto.slides)
    ? (bruto.slides as Record<string, unknown>[]).map((s, i) => ({
        n: typeof s.n === "number" ? s.n : i + 1,
        type: str(s.type) || (i === 0 ? "photo_hook" : "text"),
        hook: str(s.hook) || undefined,
        title: str(s.title) || undefined,
        body: str(s.body) || undefined,
      }))
    : []

  const payload: PiezaPayload = {
    familia,
    caption: str(bruto.caption),
    hashtags: arr(bruto.hashtags),
    fotos: arr(bruto.fotos),
    elemento: str(bruto.elemento),
    slides,
    title: str(bruto.title),
    body: str(bruto.body),
    parrafos: arr(bruto.parrafos),
  }

  // Todo lo que se publica pasa por el corrector, en una sola llamada. Las
  // busquedas de foto van en ingles y los hashtags sin tildes, asi que no.
  type Hueco = { leer: () => string; poner: (t: string) => void }
  const huecos: Hueco[] = [
    { leer: () => payload.caption, poner: (t) => (payload.caption = t) },
    { leer: () => payload.elemento, poner: (t) => (payload.elemento = t) },
    { leer: () => payload.title, poner: (t) => (payload.title = t) },
    { leer: () => payload.body, poner: (t) => (payload.body = t) },
    ...payload.parrafos.map((_, i) => ({
      leer: () => payload.parrafos[i],
      poner: (t: string) => (payload.parrafos[i] = t),
    })),
    ...payload.slides.flatMap((s) =>
      (["hook", "title", "body"] as const)
        .filter((k) => s[k])
        .map((k) => ({ leer: () => s[k] ?? "", poner: (t: string) => (s[k] = t) }))
    ),
  ]
  const corregidos = await corregirTextos(huecos.map((h) => h.leer()))
  huecos.forEach((h, i) => h.poner(corregidos[i]))

  return { payload, uso: r.uso }
}

/** Resuelve una ruta del payload ("caption", "slides.0.title") a su texto. */
function valorEnRuta(payload: PiezaPayload, ruta: string): string {
  const partes = ruta.split(".")
  let actual: unknown = payload
  for (const p of partes) {
    if (Array.isArray(actual)) actual = actual[Number(p)]
    else if (actual && typeof actual === "object") actual = (actual as Record<string, unknown>)[p]
    else return ""
  }
  return typeof actual === "string" ? actual : ""
}

/**
 * Arma el objeto de autofill de Canva a partir del mapeo de la plantilla.
 *
 * Por ahora solo se rellenan campos de texto: las imagenes de Canva piden un
 * asset subido, y traer y subir las fotos es trabajo de mas adelante. Los campos
 * de imagen de la plantilla se quedan con su valor por defecto.
 */
function camposCanva(payload: PiezaPayload, mapeo: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [campo, ruta] of Object.entries(mapeo)) {
    const texto = valorEnRuta(payload, ruta)
    if (texto) data[campo] = { type: "text", text: texto }
  }
  return data
}

/** El contexto de capas de un cartucho, resuelto en una sola consulta por lote. */
async function contextoDe(accountId: string, cartuchos: CartuchoFila[]): Promise<Map<string, Contexto>> {
  const supabase = supabaseAdmin()
  const [temas, subtemas, intenciones, narrativas, ctas] = await Promise.all([
    supabase.from("content_topics").select("id, name").eq("account_id", accountId),
    supabase.from("content_subtopics").select("id, name").eq("account_id", accountId),
    supabase.from("content_intents").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_ctas").select("id, name").eq("account_id", accountId),
  ])

  const mapa = <T,>(data: unknown) =>
    new Map(((data ?? []) as (T & { id: string })[]).map((r) => [r.id, r]))
  const nTema = mapa<{ name: string }>(temas.data)
  const nSub = mapa<{ name: string }>(subtemas.data)
  const nInt = mapa<{ name: string; description: string | null }>(intenciones.data)
  const nNarr = mapa<{ name: string; description: string | null }>(narrativas.data)

  // El cartucho no guarda un CTA concreto (el CTA es de la narrativa/receta); se
  // toma el primero de la cuenta como voz de conversion por defecto.
  const primerCta = ((ctas.data ?? []) as { name: string }[])[0]?.name ?? null

  const out = new Map<string, Contexto>()
  for (const c of cartuchos) {
    out.set(c.id, {
      tema: c.topic_id ? (nTema.get(c.topic_id)?.name ?? null) : null,
      subtema: c.subtopic_id ? (nSub.get(c.subtopic_id)?.name ?? null) : null,
      intencion: c.intent_id ? (nInt.get(c.intent_id) ?? null) : null,
      narrativa: c.narrative_id ? (nNarr.get(c.narrative_id) ?? null) : null,
      cta: primerCta,
    })
  }
  return out
}

export type ResultadoPieza = { ok: boolean; pieceId?: string; error?: string }

/** Genera una pieza a partir de un cartucho ya reclamado. */
async function generarPieza(
  receta: Receta,
  cartucho: CartuchoFila,
  ctx: Contexto,
  system: string,
  model: string
): Promise<ResultadoPieza> {
  const supabase = supabaseAdmin()

  let payload: PiezaPayload
  try {
    const r = await redactar(cartucho, ctx, receta.format, system, model)
    payload = r.payload
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // La idea no tiene la culpa de un corte de red o de un JSON roto: el
    // cartucho vuelve a la despensa para que otra pasada lo intente. El fallo
    // queda anotado como pieza 'failed', que no cuenta para el cupo del dia.
    await supabase
      .from("content_cartridges")
      .update({ status: "available", used_at: null })
      .eq("id", cartucho.id)
    const { data } = await supabase
      .from("studio_pieces")
      .insert({
        account_id: receta.account_id,
        recipe_id: receta.id,
        cartridge_id: cartucho.id,
        channel: receta.channel,
        format: receta.format,
        status: "failed",
        error: msg.slice(0, 500),
      })
      .select("id")
      .maybeSingle()
    return { ok: false, pieceId: (data as { id: string } | null)?.id, error: msg }
  }

  const usaCanva =
    receta.generator === "canva" &&
    !!receta.template?.brand_template_id &&
    !!receta.template?.campos &&
    familiaDeFormato(receta.format) !== "texto"

  const { data: fila, error: errIns } = await supabase
    .from("studio_pieces")
    .insert({
      account_id: receta.account_id,
      recipe_id: receta.id,
      cartridge_id: cartucho.id,
      channel: receta.channel,
      format: receta.format,
      status: usaCanva ? "generating" : "generated",
      payload,
    })
    .select("id")
    .maybeSingle()

  if (errIns) return { ok: false, error: errIns.message }
  const pieceId = (fila as { id: string } | null)?.id
  if (!pieceId) return { ok: false, error: "No se pudo crear la pieza." }

  // Sin Canva (o sin plantilla configurada): la pieza queda como texto listo.
  if (!usaCanva) return { ok: true, pieceId }

  const canva = await generarConCanva(
    receta.template!.brand_template_id!,
    camposCanva(payload, receta.template!.campos!),
    cartucho.idea
  )

  await supabase
    .from("studio_pieces")
    .update(
      canva.ok
        ? {
            status: "generated",
            canva_design_id: canva.designId,
            payload: { ...payload, imagenes: canva.imagenes },
          }
        : { status: "failed", error: canva.error.slice(0, 500) }
    )
    .eq("id", pieceId)

  return canva.ok ? { ok: true, pieceId } : { ok: false, pieceId, error: canva.error }
}

/** Reclama hasta `limite` cartuchos disponibles de un pilar, sin colisiones. */
async function reclamar(accountId: string, pillarId: string, limite: number): Promise<CartuchoFila[]> {
  if (limite <= 0) return []
  const { data, error } = await supabaseAdmin().rpc("reclamar_cartuchos", {
    p_account: accountId,
    p_pillar: pillarId,
    p_limite: limite,
  })
  if (error) throw new Error(`No se pudieron reclamar cartuchos: ${error.message}`)
  return (data ?? []) as CartuchoFila[]
}

/** Cuantas piezas produjo hoy una receta, en la zona de la cuenta. */
async function producidasHoy(recipeId: string, timezone: string, now: Date): Promise<number> {
  const desde = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin()
    .from("studio_pieces")
    .select("created_at")
    .eq("recipe_id", recipeId)
    .neq("status", "failed")
    .gte("created_at", desde)
  const hoy = dayIn(timezone, now)
  return ((data ?? []) as { created_at: string }[]).filter(
    (p) => dayIn(timezone, new Date(p.created_at)) === hoy
  ).length
}

export type ResultadoReceta = {
  recipeId: string
  name: string
  generadas: number
  errores: number
  motivo?: string
}

/**
 * Corre las recetas de una cuenta que toquen ahora.
 *
 * `force` salta el candado de hora y el horario, para el boton de "generar
 * ahora". `presupuesto` limita cuantas piezas se hacen en esta pasada, que es lo
 * que evita que un tick se pase del tiempo de la funcion.
 */
export async function correrRecetas(opciones: {
  accountId: string
  timezone: string
  now?: Date
  force?: boolean
  recipeId?: string
  presupuesto: number
}): Promise<ResultadoReceta[]> {
  const { accountId, timezone, force = false, recipeId, presupuesto } = opciones
  const now = opciones.now ?? new Date()
  const supabase = supabaseAdmin()
  const hora = hourIn(timezone, now)

  let q = supabase.from("content_recipes").select("*").eq("account_id", accountId).eq("enabled", true)
  if (recipeId) q = q.eq("id", recipeId)
  const { data, error } = await q
  if (error) throw new Error(`No se pudieron leer las recetas: ${error.message}`)

  const cfg = await studioConfig(accountId)
  const recetas = (data ?? []) as Receta[]
  const salida: ResultadoReceta[] = []
  let restante = presupuesto

  for (const receta of recetas) {
    if (restante <= 0) break

    if (!force) {
      if (!receta.run_at.includes(hora)) {
        salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "no es su hora" })
        continue
      }
      // Candado por hora: si ya corrio esta hora de hoy, no repite.
      if (receta.last_run_at) {
        const ultima = new Date(receta.last_run_at)
        if (dayIn(timezone, ultima) === dayIn(timezone, now) && hourIn(timezone, ultima) === hora) {
          salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "ya corrio esta hora" })
          continue
        }
      }
    }

    const hechasHoy = await producidasHoy(receta.id, timezone, now)
    const pendientesHoy = Math.max(0, receta.per_day - hechasHoy)
    // Reparte per_day entre las horas del dia; en force, todo lo que falte.
    const porTanda = force
      ? pendientesHoy
      : Math.min(pendientesHoy, Math.ceil(receta.per_day / Math.max(1, receta.run_at.length)))
    const cuantas = Math.min(porTanda, restante)

    if (cuantas <= 0) {
      if (!force) await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
      salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "cupo del dia cubierto" })
      continue
    }

    const cartuchos = await reclamar(accountId, receta.pillar_id, cuantas)
    if (cartuchos.length === 0) {
      if (!force) await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
      salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "sin cartuchos disponibles" })
      continue
    }

    const ctxs = await contextoDe(accountId, cartuchos)
    let generadas = 0
    let errores = 0
    for (const c of cartuchos) {
      const r = await generarPieza(receta, c, ctxs.get(c.id)!, cfg.promptContenido, cfg.modelContenido)
      if (r.ok) generadas++
      else errores++
      restante--
      if (restante <= 0) break
    }

    // El candado de la hora solo se cierra si la tanda salio entera. Si el
    // presupuesto de la pasada la corto, la siguiente pasada de esta misma hora
    // hace lo que falta; producidasHoy impide que se pase del cupo del dia.
    if (!force && cuantas >= porTanda) {
      await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
    }
    salida.push({ recipeId: receta.id, name: receta.name, generadas, errores })
  }

  return salida
}
