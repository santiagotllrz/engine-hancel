import { NextRequest, NextResponse } from "next/server"
import { usuarioActual } from "@/lib/supabase/auth"

export const maxDuration = 60

export type VarianteHls = {
  id: string
  url: string
  resolucion: string | null
  width: number | null
  height: number | null
  etiquetaCalidad: string
  bandwidth: number | null
  codecs: string | null
  frameRate: number | null
  audioGroupId: string | null
  audioUrl: string | null
}

export type SegmentoHls = {
  index: number
  url: string
  duracion: number
  initUrl?: string | null
  keyUrl?: string | null
  keyIv?: string | null
}

export type FuenteVideoDetectada = {
  id: string
  titulo: string
  origen: "hls" | "mp4" | "pagina"
  urlOriginal: string
  /** Si es HLS: lista de variantes ordenadas de mayor a menor calidad. */
  variantes: VarianteHls[]
  /** Si es archivo directo (MP4, WebM, MOV). */
  directUrl: string | null
  contentType: string | null
  contentLength: number | null
  duracionSegundos: number | null
  miniaturaUrl: string | null
}

const CABECERAS_NAVEGADOR: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}

function esUrlSegura(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    const host = parsed.hostname.toLowerCase()
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * POST /api/descargar-videos
 *
 * Modos:
 * 1) { action: "analyze", url: "..." } -> Analiza un enlace (.m3u8, .mp4 o pagina web)
 *    y devuelve todas las fuentes de video y calidades disponibles.
 * 2) { action: "segments", playlistUrl: "...", audioPlaylistUrl?: "..." } ->
 *    Resuelve la lista exacta de segmentos (.ts / .m4s) de una variante HLS.
 */
export async function POST(req: NextRequest) {
  const usuario = await usuarioActual()
  if (!usuario) {
    return NextResponse.json({ ok: false, error: "Sesión requerida." }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      action?: "analyze" | "segments"
      url?: string
      playlistUrl?: string
      audioPlaylistUrl?: string | null
    }

    if (body.action === "segments") {
      const target = body.playlistUrl ? esUrlSegura(body.playlistUrl) : null
      if (!target) {
        return NextResponse.json({ ok: false, error: "URL de playlist no válida." }, { status: 400 })
      }
      const videoPlaylist = await resolverMediaPlaylistHls(target.toString())
      const audioPlaylist = body.audioPlaylistUrl
        ? await resolverMediaPlaylistHls(body.audioPlaylistUrl).catch(() => null)
        : null

      return NextResponse.json({
        ok: true,
        esFmp4: videoPlaylist.esFmp4,
        duracionTotal: videoPlaylist.duracionTotal,
        segmentos: videoPlaylist.segmentos,
        segmentosAudio: audioPlaylist ? audioPlaylist.segmentos : [],
      })
    }

    const parsedUrl = body.url ? esUrlSegura(body.url) : null
    if (!parsedUrl) {
      return NextResponse.json(
        { ok: false, error: "Ingresa un enlace válido que empiece por https:// o http://." },
        { status: 400 }
      )
    }

    const fuentes = await analizarEnlace(parsedUrl)
    if (fuentes.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No se encontraron transmisiones de video (.m3u8 o .mp4) en ese enlace. Si es una página protegida, copia el enlace .m3u8 o .mp4 desde la pestaña Red del navegador.",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, fuentes })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error al analizar el enlace." },
      { status: 500 }
    )
  }
}

/**
 * GET /api/descargar-videos?url=...
 * Proxy para sortear bloqueos CORS al descargar segmentos .ts/.m4s o archivos .mp4
 * desde el navegador.
 */
export async function GET(req: NextRequest) {
  const usuario = await usuarioActual()
  if (!usuario) {
    return new NextResponse("Sesión requerida", { status: 401 })
  }

  const rawUrl = req.nextUrl.searchParams.get("url") ?? ""
  const target = esUrlSegura(rawUrl)
  if (!target) {
    return new NextResponse("URL no permitida", { status: 400 })
  }

  const downloadFilename = req.nextUrl.searchParams.get("filename")

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        ...CABECERAS_NAVEGADOR,
        Referer: `${target.protocol}//${target.host}/`,
      },
      redirect: "follow",
    })

    if (!upstream.ok) {
      return new NextResponse(`Error del servidor remoto: ${upstream.status}`, {
        status: upstream.status,
      })
    }

    const headers = new Headers()
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"
    headers.set("Content-Type", contentType)
    const contentLength = upstream.headers.get("content-length")
    if (contentLength) headers.set("Content-Length", contentLength)
    headers.set("Cache-Control", "private, max-age=3600")

    if (downloadFilename) {
      const limpio = downloadFilename.replace(/[^a-zA-Z0-9._-]/g, "_")
      headers.set("Content-Disposition", `attachment; filename="${limpio}"`)
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    })
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : "Error al conectar con el origen",
      { status: 502 }
    )
  }
}

async function analizarEnlace(url: URL): Promise<FuenteVideoDetectada[]> {
  const urlStr = url.toString()
  const pathLower = url.pathname.toLowerCase()

  // 1. Si la URL apunta directamente a un .m3u8
  if (pathLower.endsWith(".m3u8") || urlStr.includes(".m3u8")) {
    const fuente = await construirFuenteHls(urlStr, nombreDesdeUrl(url, "video-hls"))
    return fuente ? [fuente] : []
  }

  // 2. Si parece un archivo directo de video (.mp4, .webm, .mov, .m4v)
  if (/\.(mp4|webm|mov|m4v)$/i.test(pathLower)) {
    const head = await fetch(urlStr, {
      method: "HEAD",
      headers: CABECERAS_NAVEGADOR,
      redirect: "follow",
    }).catch(() => null)
    const length = head?.headers.get("content-length")
    return [
      {
        id: "direct-0",
        titulo: nombreDesdeUrl(url, "video"),
        origen: "mp4",
        urlOriginal: urlStr,
        variantes: [],
        directUrl: urlStr,
        contentType: head?.headers.get("content-type") ?? "video/mp4",
        contentLength: length ? Number(length) : null,
        duracionSegundos: null,
        miniaturaUrl: null,
      },
    ]
  }

  // 3. Hacer GET para inspeccionar si es un manifiesto HLS, un binario de video o una pagina HTML
  const resp = await fetch(urlStr, {
    headers: CABECERAS_NAVEGADOR,
    redirect: "follow",
  })
  if (!resp.ok) {
    throw new Error(`El servidor respondió con código HTTP ${resp.status}.`)
  }

  const contentType = (resp.headers.get("content-type") ?? "").toLowerCase()

  if (
    contentType.includes("mpegurl") ||
    contentType.includes("vnd.apple.mpegurl")
  ) {
    const texto = await resp.text()
    const fuente = await construirFuenteHlsDesdeTexto(urlStr, texto, nombreDesdeUrl(url, "video-hls"))
    return fuente ? [fuente] : []
  }

  if (contentType.startsWith("video/")) {
    const length = resp.headers.get("content-length")
    try {
      await resp.body?.cancel()
    } catch {}
    return [
      {
        id: "direct-0",
        titulo: nombreDesdeUrl(url, "video"),
        origen: "mp4",
        urlOriginal: urlStr,
        variantes: [],
        directUrl: urlStr,
        contentType,
        contentLength: length ? Number(length) : null,
        duracionSegundos: null,
        miniaturaUrl: null,
      },
    ]
  }

  // Es HTML o JSON: buscar streams embebidos en la pagina
  const html = await resp.text()
  if (html.trimStart().startsWith("#EXTM3U")) {
    const fuente = await construirFuenteHlsDesdeTexto(urlStr, html, nombreDesdeUrl(url, "video-hls"))
    return fuente ? [fuente] : []
  }

  return extraerVideosDeHtml(url, html)
}

async function construirFuenteHls(
  m3u8Url: string,
  tituloBase: string,
  miniaturaUrl: string | null = null
): Promise<FuenteVideoDetectada | null> {
  const resp = await fetch(m3u8Url, {
    headers: CABECERAS_NAVEGADOR,
    redirect: "follow",
  }).catch(() => null)
  if (!resp || !resp.ok) return null
  const texto = await resp.text()
  if (!texto.includes("#EXTM3U")) return null
  return construirFuenteHlsDesdeTexto(m3u8Url, texto, tituloBase, miniaturaUrl)
}

async function construirFuenteHlsDesdeTexto(
  m3u8Url: string,
  texto: string,
  tituloBase: string,
  miniaturaUrl: string | null = null
): Promise<FuenteVideoDetectada | null> {
  const parsedUrl = new URL(m3u8Url)
  let variantes = parsearMasterPlaylist(m3u8Url, texto)

  // Si es un enlace de Mux con filtros (ej. ?min_resolution=1080p), consultar tambien
  // el master playlist sin filtros para ofrecer todas las calidades disponibles.
  let muxPlaybackId: string | null = null
  const matchMux = parsedUrl.hostname.includes("mux.com")
    ? parsedUrl.pathname.match(/\/([a-zA-Z0-9]+)\.m3u8/)
    : null
  if (matchMux) {
    muxPlaybackId = matchMux[1]
    if (!miniaturaUrl) {
      miniaturaUrl = `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?width=640`
    }
    if (parsedUrl.search) {
      const baseMuxUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`
      const respBase = await fetch(baseMuxUrl, { headers: CABECERAS_NAVEGADOR }).catch(() => null)
      if (respBase?.ok) {
        const textoBase = await respBase.text()
        const variantesBase = parsearMasterPlaylist(baseMuxUrl, textoBase)
        const vistos = new Set(variantes.map((v) => v.resolucion ?? v.etiquetaCalidad))
        for (const vb of variantesBase) {
          const clave = vb.resolucion ?? vb.etiquetaCalidad
          if (!vistos.has(clave)) {
            variantes.push(vb)
            vistos.add(clave)
          }
        }
      }
    }
  }

  // Ordenar variantes de mayor a menor resolucion / bitrate
  variantes.sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0)
    const areaB = (b.width ?? 0) * (b.height ?? 0)
    if (areaB !== areaA) return areaB - areaA
    return (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
  })

  // Si el archivo .m3u8 era directamente una media playlist (con #EXTINF y sin #EXT-X-STREAM-INF)
  if (variantes.length === 0) {
    variantes = [
      {
        id: "var-0",
        url: m3u8Url,
        resolucion: null,
        width: null,
        height: null,
        etiquetaCalidad: "Calidad original",
        bandwidth: null,
        codecs: null,
        frameRate: null,
        audioGroupId: null,
        audioUrl: null,
      },
    ]
  }

  // Calcular duracion aproximada inspeccionando la primera variante
  let duracionSegundos: number | null = null
  const primera = variantes[0]
  if (primera) {
    const media = await resolverMediaPlaylistHls(primera.url).catch(() => null)
    if (media && media.duracionTotal > 0) {
      duracionSegundos = Math.round(media.duracionTotal)
    }
  }

  return {
    id: muxPlaybackId ? `mux-${muxPlaybackId}` : `hls-${Math.random().toString(36).slice(2, 8)}`,
    titulo: muxPlaybackId && tituloBase === "video-hls" ? `mux-${muxPlaybackId}` : tituloBase,
    origen: "hls",
    urlOriginal: m3u8Url,
    variantes,
    directUrl: null,
    contentType: "application/vnd.apple.mpegurl",
    contentLength: null,
    duracionSegundos,
    miniaturaUrl,
  }
}

function parsearMasterPlaylist(baseUrl: string, texto: string): VarianteHls[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (!lineas.some((l) => l.startsWith("#EXT-X-STREAM-INF:"))) {
    return []
  }

  // Mapear grupos de audio (#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="...",URI="...")
  const gruposAudio = new Map<string, string>()
  for (const l of lineas) {
    if (!l.startsWith("#EXT-X-MEDIA:")) continue
    const attrs = parsearAtributosM3u8(l.slice("#EXT-X-MEDIA:".length))
    if (attrs.TYPE === "AUDIO" && attrs["GROUP-ID"] && attrs.URI) {
      const audioAbs = new URL(attrs.URI, baseUrl).toString()
      if (!gruposAudio.has(attrs["GROUP-ID"]) || attrs.DEFAULT === "YES") {
        gruposAudio.set(attrs["GROUP-ID"], audioAbs)
      }
    }
  }

  const variantes: VarianteHls[] = []
  const clavesVistas = new Set<string>()

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    if (!l.startsWith("#EXT-X-STREAM-INF:")) continue
    const attrs = parsearAtributosM3u8(l.slice("#EXT-X-STREAM-INF:".length))
    let uriLinea: string | null = null
    for (let j = i + 1; j < lineas.length; j++) {
      if (!lineas[j].startsWith("#")) {
        uriLinea = lineas[j]
        i = j
        break
      }
    }
    if (!uriLinea) continue

    const absUrl = new URL(uriLinea, baseUrl).toString()
    const resolucion = attrs.RESOLUTION ?? null
    let width: number | null = null
    let height: number | null = null
    if (resolucion && resolucion.includes("x")) {
      const [w, h] = resolucion.split("x").map((n) => parseInt(n, 10))
      if (!Number.isNaN(w) && !Number.isNaN(h)) {
        width = w
        height = h
      }
    }
    const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : null
    const frameRate = attrs["FRAME-RATE"] ? parseFloat(attrs["FRAME-RATE"]) : null
    const codecs = attrs.CODECS ?? null
    const audioGroupId = attrs.AUDIO ?? null
    const audioUrl = audioGroupId ? (gruposAudio.get(audioGroupId) ?? null) : null

    // Evitar duplicar streams redundantes de distinto CDN con misma resolucion y bitrate
    const dedupeKey = `${resolucion ?? "none"}-${bandwidth ?? 0}`
    if (clavesVistas.has(dedupeKey)) continue
    clavesVistas.add(dedupeKey)

    const etiquetaCalidad = height
      ? `${height}p (${width}×${height})`
      : bandwidth
        ? `${(bandwidth / 1_000_000).toFixed(1)} Mbps`
        : `Variante ${variantes.length + 1}`

    variantes.push({
      id: `var-${variantes.length}`,
      url: absUrl,
      resolucion,
      width,
      height,
      etiquetaCalidad,
      bandwidth,
      codecs,
      frameRate,
      audioGroupId,
      audioUrl,
    })
  }

  return variantes
}

async function resolverMediaPlaylistHls(playlistUrl: string): Promise<{
  esFmp4: boolean
  duracionTotal: number
  segmentos: SegmentoHls[]
}> {
  const resp = await fetch(playlistUrl, {
    headers: CABECERAS_NAVEGADOR,
    redirect: "follow",
  })
  if (!resp.ok) {
    throw new Error(`No se pudo leer la lista de segmentos (${resp.status}).`)
  }
  const texto = await resp.text()
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // Si por alguna razon nos pasaron otra master playlist, seguir la primera variante
  if (lineas.some((l) => l.startsWith("#EXT-X-STREAM-INF:"))) {
    const subVariantes = parsearMasterPlaylist(playlistUrl, texto)
    if (subVariantes.length > 0) {
      return resolverMediaPlaylistHls(subVariantes[0].url)
    }
  }

  const segmentos: SegmentoHls[] = []
  let duracionActual = 0
  let duracionTotal = 0
  let initUrl: string | null = null
  let keyUrl: string | null = null
  let keyIv: string | null = null
  let esFmp4 = false

  for (const l of lineas) {
    if (l.startsWith("#EXT-X-MAP:")) {
      const attrs = parsearAtributosM3u8(l.slice("#EXT-X-MAP:".length))
      if (attrs.URI) {
        initUrl = new URL(attrs.URI, playlistUrl).toString()
        esFmp4 = true
      }
    } else if (l.startsWith("#EXT-X-KEY:")) {
      const attrs = parsearAtributosM3u8(l.slice("#EXT-X-KEY:".length))
      if (attrs.METHOD && attrs.METHOD !== "NONE" && attrs.URI) {
        keyUrl = new URL(attrs.URI, playlistUrl).toString()
        keyIv = attrs.IV ?? null
      } else {
        keyUrl = null
        keyIv = null
      }
    } else if (l.startsWith("#EXTINF:")) {
      const valor = parseFloat(l.slice("#EXTINF:".length).split(",")[0])
      duracionActual = Number.isFinite(valor) ? valor : 0
    } else if (!l.startsWith("#")) {
      const segUrl = new URL(l, playlistUrl).toString()
      if (/\.m4s(\?|$)/i.test(segUrl)) esFmp4 = true
      duracionTotal += duracionActual
      segmentos.push({
        index: segmentos.length,
        url: segUrl,
        duracion: duracionActual,
        initUrl,
        keyUrl,
        keyIv,
      })
      duracionActual = 0
    }
  }

  return { esFmp4, duracionTotal, segmentos }
}

async function extraerVideosDeHtml(pageUrl: URL, html: string): Promise<FuenteVideoDetectada[]> {
  const tituloMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const tituloPagina = tituloMatch
    ? limpiarNombreArchivo(decodificarEntidadesHtml(tituloMatch[1].trim()))
    : nombreDesdeUrl(pageUrl, "video-web")

  const ogImageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const miniaturaPagina = ogImageMatch ? resolverUrlRelativa(ogImageMatch[1], pageUrl) : null

  const candidatosM3u8 = new Set<string>()
  const candidatosMp4 = new Set<string>()

  // Desescapar barras invertidas comunes en JSON embebido (https:\/\/...)
  const htmlNormalizado = html.replace(/\\\//g, "/")

  // 1. URLs .m3u8 directas en el HTML o scripts
  const regexM3u8 = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi
  for (const m of htmlNormalizado.matchAll(regexM3u8)) {
    candidatosM3u8.add(limpiarUrlExtraida(m[0]))
  }

  // 2. Atributos playback-id de <mux-player>, <mux-video> o JSON playbackId
  const regexMuxAttr = /(?:playback-id|playbackId)\s*[:=]\s*["']([a-zA-Z0-9]{20,60})["']/g
  for (const m of htmlNormalizado.matchAll(regexMuxAttr)) {
    candidatosM3u8.add(`https://stream.mux.com/${m[1]}.m3u8`)
  }

  // 3. URLs .mp4 / .webm directas en etiquetas <video>, <source>, meta og:video o JSON
  const regexMp4 = /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|mov)(?:\?[^\s"'<>\\]*)?/gi
  for (const m of htmlNormalizado.matchAll(regexMp4)) {
    candidatosMp4.add(limpiarUrlExtraida(m[0]))
  }

  // 4. Rutas relativas en <video src="..."> o <source src="...">
  const regexSrc = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi
  for (const m of html.matchAll(regexSrc)) {
    const abs = resolverUrlRelativa(m[1], pageUrl)
    if (!abs) continue
    if (abs.includes(".m3u8")) candidatosM3u8.add(abs)
    else if (/\.(mp4|webm|mov)/i.test(abs)) candidatosMp4.add(abs)
  }

  const fuentes: FuenteVideoDetectada[] = []

  let idx = 1
  for (const m3u8 of Array.from(candidatosM3u8).slice(0, 6)) {
    if (!esUrlSegura(m3u8)) continue
    const titulo = candidatosM3u8.size > 1 ? `${tituloPagina}-${idx}` : tituloPagina
    const fuente = await construirFuenteHls(m3u8, titulo, miniaturaPagina)
    if (fuente) {
      fuente.origen = "pagina"
      fuentes.push(fuente)
      idx++
    }
  }

  for (const mp4 of Array.from(candidatosMp4).slice(0, 6)) {
    if (!esUrlSegura(mp4)) continue
    const parsedMp4 = new URL(mp4)
    fuentes.push({
      id: `mp4-${idx}`,
      titulo: nombreDesdeUrl(parsedMp4, `${tituloPagina}-${idx}`),
      origen: "pagina",
      urlOriginal: mp4,
      variantes: [],
      directUrl: mp4,
      contentType: "video/mp4",
      contentLength: null,
      duracionSegundos: null,
      miniaturaUrl: miniaturaPagina,
    })
    idx++
  }

  return fuentes
}

function parsearAtributosM3u8(cadena: string): Record<string, string> {
  const resultado: Record<string, string> = {}
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g
  for (const match of cadena.matchAll(regex)) {
    const clave = match[1]
    const valor = match[2] !== undefined ? match[2] : match[3]
    resultado[clave] = valor
  }
  return resultado
}

function nombreDesdeUrl(url: URL, porDefecto: string): string {
  const partes = url.pathname.split("/").filter(Boolean)
  const ultimo = partes[partes.length - 1]
  if (!ultimo) return porDefecto
  const sinExt = ultimo.replace(/\.(m3u8|mp4|webm|mov|m4v|html|htm)$/i, "")
  return limpiarNombreArchivo(sinExt) || porDefecto
}

function limpiarNombreArchivo(nombre: string): string {
  return nombre
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

function limpiarUrlExtraida(raw: string): string {
  return decodificarEntidadesHtml(raw).replace(/[),.;]+$/, "")
}

function resolverUrlRelativa(rel: string, base: URL): string | null {
  try {
    return new URL(decodificarEntidadesHtml(rel), base).toString()
  } catch {
    return null
  }
}

function decodificarEntidadesHtml(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}
