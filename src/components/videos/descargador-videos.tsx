"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FilmIcon,
  LinkIcon,
  Loader2Icon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
  VideoIcon,
  XCircleIcon,
} from "lucide-react"

import type {
  FuenteVideoDetectada,
  SegmentoHls,
  VarianteHls,
} from "@/app/api/descargar-videos/route"
import { concatenarBuffers, remuxTsToMp4 } from "@/lib/ts-to-mp4"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const EJEMPLO_MUX =
  "https://stream.mux.com/qKG01eyz4aACprIBtkonKIGevYqktHrZ56hVBc4rDVPU.m3u8?min_resolution=1080p&redundant_streams=true"

type DescargaCompletada = {
  id: string
  nombreArchivo: string
  calidad: string
  formato: "mp4" | "ts"
  tamanoBytes: number
  duracionSegundos: number | null
  blobUrl: string
  creadoEn: string
}

export function DescargadorVideos() {
  const [urlInput, setUrlInput] = React.useState("")
  const [analizando, setAnalizando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [fuentes, setFuentes] = React.useState<FuenteVideoDetectada[]>([])
  const [fuenteId, setFuenteId] = React.useState<string>("")
  const [varianteId, setVarianteId] = React.useState<string>("")
  const [formatoSalida, setFormatoSalida] = React.useState<"mp4" | "ts">("mp4")
  const [nombreArchivo, setNombreArchivo] = React.useState<string>("")

  // Estado de descarga activa
  const [descargando, setDescargando] = React.useState(false)
  const [etapaDescarga, setEtapaDescarga] = React.useState<string>("")
  const [progreso, setProgreso] = React.useState<{
    completados: number
    total: number
    bytesDescargados: number
  } | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  // Vista previa e historial de la sesion
  const [ultimoResultado, setUltimoResultado] = React.useState<DescargaCompletada | null>(null)
  const [historial, setHistorial] = React.useState<DescargaCompletada[]>([])

  // Limpiar Object URLs al desmontar
  React.useEffect(() => {
    return () => {
      historial.forEach((h) => URL.revokeObjectURL(h.blobUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fuenteActual = React.useMemo(
    () => fuentes.find((f) => f.id === fuenteId) ?? fuentes[0] ?? null,
    [fuentes, fuenteId]
  )

  const varianteActual = React.useMemo<VarianteHls | null>(() => {
    if (!fuenteActual || fuenteActual.variantes.length === 0) return null
    return fuenteActual.variantes.find((v) => v.id === varianteId) ?? fuenteActual.variantes[0]
  }, [fuenteActual, varianteId])

  const analizarUrl = async (urlParaAnalizar?: string) => {
    const objetivo = (urlParaAnalizar ?? urlInput).trim()
    if (!objetivo) {
      setError("Pega el enlace del video (.m3u8, .mp4 o la dirección de la página web).")
      return
    }
    setError(null)
    setAnalizando(true)
    setFuentes([])
    setUltimoResultado(null)

    try {
      const resp = await fetch("/api/descargar-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", url: objetivo }),
      })
      const data = (await resp.json()) as
        | { ok: true; fuentes: FuenteVideoDetectada[] }
        | { ok: false; error: string }

      if (!data.ok) {
        setError(data.error)
        return
      }

      setFuentes(data.fuentes)
      const primera = data.fuentes[0]
      if (primera) {
        setFuenteId(primera.id)
        setNombreArchivo(primera.titulo)
        if (primera.variantes[0]) {
          setVarianteId(primera.variantes[0].id)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar el enlace.")
    } finally {
      setAnalizando(false)
    }
  }

  const cancelarDescarga = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setDescargando(false)
    setEtapaDescarga("")
    setProgreso(null)
  }

  const iniciarDescarga = async () => {
    if (!fuenteActual || descargando) return

    setError(null)
    setDescargando(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const baseNombre =
        (nombreArchivo.trim() || fuenteActual.titulo || "video").replace(/\.(mp4|ts|webm|mov)$/i, "")

      // Caso 1: Video directo (.mp4, .webm, .mov)
      if (fuenteActual.directUrl && fuenteActual.variantes.length === 0) {
        setEtapaDescarga("Descargando archivo de video…")
        setProgreso({ completados: 0, total: 1, bytesDescargados: 0 })

        const buffer = await descargarRecursoConFallback(
          fuenteActual.directUrl,
          controller.signal,
          (bytes) => setProgreso({ completados: 0, total: 1, bytesDescargados: bytes })
        )

        const blob = new Blob([buffer.buffer as ArrayBuffer], {
          type: fuenteActual.contentType || "video/mp4",
        })
        const blobUrl = URL.createObjectURL(blob)
        const archivoFinal = `${baseNombre}.mp4`

        const item: DescargaCompletada = {
          id: `${Date.now()}`,
          nombreArchivo: archivoFinal,
          calidad: "Directo",
          formato: "mp4",
          tamanoBytes: buffer.byteLength,
          duracionSegundos: fuenteActual.duracionSegundos,
          blobUrl,
          creadoEn: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
        }

        setUltimoResultado(item)
        setHistorial((prev) => [item, ...prev])
        dispararDescargaNavegador(blobUrl, archivoFinal)
        return
      }

      // Caso 2: Stream HLS (.m3u8)
      const variante = varianteActual
      if (!variante) {
        throw new Error("Selecciona una calidad de video para descargar.")
      }

      setEtapaDescarga("Obteniendo lista de segmentos del stream…")
      const respSeg = await fetch("/api/descargar-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "segments",
          playlistUrl: variante.url,
          audioPlaylistUrl: variante.audioUrl,
        }),
        signal: controller.signal,
      })

      const dataSeg = (await respSeg.json()) as
        | {
            ok: true
            esFmp4: boolean
            duracionTotal: number
            segmentos: SegmentoHls[]
            segmentosAudio: SegmentoHls[]
          }
        | { ok: false; error: string }

      if (!dataSeg.ok) {
        throw new Error(dataSeg.error)
      }

      if (dataSeg.segmentos.length === 0) {
        throw new Error("La lista de reproducción no contiene segmentos de video descargables.")
      }

      const totalSegmentos = dataSeg.segmentos.length + dataSeg.segmentosAudio.length
      let completados = 0
      let bytesDescargados = 0

      setProgreso({ completados: 0, total: totalSegmentos, bytesDescargados: 0 })
      setEtapaDescarga(`Descargando ${totalSegmentos} segmentos en alta velocidad…`)

      const cacheClaves = new Map<string, CryptoKey>()
      const cacheInits = new Map<string, Uint8Array>()

      const bajarLista = async (lista: SegmentoHls[]): Promise<Uint8Array[]> => {
        const resultados: Uint8Array[] = new Array(lista.length)
        let cursor = 0
        const concurrencia = Math.min(5, lista.length)

        const trabajador = async () => {
          while (cursor < lista.length) {
            if (controller.signal.aborted) throw new Error("Descarga cancelada.")
            const idx = cursor++
            const seg = lista[idx]

            let datos = await descargarRecursoConFallback(seg.url, controller.signal)

            // Si el segmento esta cifrado con AES-128, descifrarlo
            if (seg.keyUrl) {
              datos = await descifrarSegmentoAes128(
                datos,
                seg.keyUrl,
                seg.keyIv ?? null,
                seg.index,
                cacheClaves,
                controller.signal
              )
            }

            // Si es fMP4 y es el primer segmento con initUrl, anteponer el segmento de inicializacion
            if (idx === 0 && seg.initUrl) {
              let initBytes = cacheInits.get(seg.initUrl)
              if (!initBytes) {
                initBytes = await descargarRecursoConFallback(seg.initUrl, controller.signal)
                cacheInits.set(seg.initUrl, initBytes)
              }
              datos = concatenarBuffers([initBytes, datos])
            }

            resultados[idx] = datos
            completados++
            bytesDescargados += datos.byteLength
            setProgreso({ completados, total: totalSegmentos, bytesDescargados })
          }
        }

        await Promise.all(Array.from({ length: concurrencia }, () => trabajador()))
        return resultados
      }

      const buffersVideo = await bajarLista(dataSeg.segmentos)
      const buffersAudio =
        dataSeg.segmentosAudio.length > 0 ? await bajarLista(dataSeg.segmentosAudio) : []

      let bytesFinales: Uint8Array
      let mimeFinal: string
      let extFinal: "mp4" | "ts"

      if (formatoSalida === "mp4") {
        setEtapaDescarga("Empaquetando video y audio a contenedor MP4 (sin pérdida)…")
        // Dejar que React pinte el mensaje antes del remux sincrono
        await new Promise((r) => setTimeout(r, 30))

        if (dataSeg.esFmp4) {
          bytesFinales = concatenarBuffers(buffersVideo)
        } else {
          bytesFinales = remuxTsToMp4(buffersVideo, buffersAudio, {
            width: variante.width ?? undefined,
            height: variante.height ?? undefined,
          })
        }
        mimeFinal = "video/mp4"
        extFinal = "mp4"
      } else {
        setEtapaDescarga("Uniendo segmentos MPEG-TS…")
        bytesFinales = concatenarBuffers(buffersVideo)
        mimeFinal = "video/mp2t"
        extFinal = "ts"
      }

      const blob = new Blob([bytesFinales.buffer as ArrayBuffer], { type: mimeFinal })
      const blobUrl = URL.createObjectURL(blob)
      const sufijoCalidad = variante.height ? `-${variante.height}p` : ""
      const archivoFinal = `${baseNombre}${sufijoCalidad}.${extFinal}`

      const item: DescargaCompletada = {
        id: `${Date.now()}`,
        nombreArchivo: archivoFinal,
        calidad: variante.etiquetaCalidad,
        formato: extFinal,
        tamanoBytes: bytesFinales.byteLength,
        duracionSegundos: Math.round(dataSeg.duracionTotal) || fuenteActual.duracionSegundos,
        blobUrl,
        creadoEn: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      }

      setUltimoResultado(item)
      setHistorial((prev) => [item, ...prev])
      dispararDescargaNavegador(blobUrl, archivoFinal)
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Ocurrió un error durante la descarga.")
      }
    } finally {
      setDescargando(false)
      setEtapaDescarga("")
      setProgreso(null)
      abortRef.current = null
    }
  }

  const porcentaje =
    progreso && progreso.total > 0
      ? Math.min(100, Math.round((progreso.completados / progreso.total) * 100))
      : 0

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DownloadIcon className="size-5 text-primary" />
                Descargar videos por enlace
              </CardTitle>
              <CardDescription className="mt-1">
                Pega un enlace de streaming HLS (<code>.m3u8</code> de Mux, Cloudflare, Vimeo, etc.), un
                enlace directo <code>.mp4</code> o la URL de una página web con video embebido.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={analizando || descargando}
              onClick={() => {
                setUrlInput(EJEMPLO_MUX)
                void analizarUrl(EJEMPLO_MUX)
              }}
            >
              <SparklesIcon className="size-3.5" />
              Cargar ejemplo Mux 1080p
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void analizarUrl()
            }}
          >
            <div className="relative flex-1">
              <LinkIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={urlInput}
                disabled={analizando || descargando}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://stream.mux.com/...m3u8?min_resolution=1080p o URL de página web"
                className="pl-9 font-mono text-xs sm:text-sm"
              />
            </div>
            <Button type="submit" disabled={analizando || descargando || !urlInput.trim()}>
              {analizando ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Analizando enlace…
                </>
              ) : (
                <>
                  <FilmIcon className="size-4" />
                  Analizar video
                </>
              )}
            </Button>
          </form>

          {error ? (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2.5 rounded-lg border p-3 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {fuenteActual ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">Configuración de descarga</CardTitle>
                  <Badge variant="secondary">
                    {fuenteActual.origen === "hls"
                      ? "Stream HLS (.m3u8)"
                      : fuenteActual.origen === "mp4"
                        ? "Video directo"
                        : "Extraído de página web"}
                  </Badge>
                  {fuenteActual.duracionSegundos ? (
                    <Badge variant="outline">
                      Duración: {formatearDuracion(fuenteActual.duracionSegundos)}
                    </Badge>
                  ) : null}
                </div>
                <CardDescription className="line-clamp-1 font-mono text-xs">
                  {fuenteActual.urlOriginal}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {fuentes.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label>Videos encontrados en la página ({fuentes.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {fuentes.map((f, idx) => (
                    <Button
                      key={f.id}
                      type="button"
                      size="sm"
                      variant={f.id === fuenteActual.id ? "default" : "outline"}
                      disabled={descargando}
                      onClick={() => {
                        setFuenteId(f.id)
                        setNombreArchivo(f.titulo)
                        if (f.variantes[0]) setVarianteId(f.variantes[0].id)
                      }}
                    >
                      <VideoIcon className="size-3.5" />
                      Video {idx + 1}: {f.titulo}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {fuenteActual.variantes.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="select-calidad">Resolución / Calidad</Label>
                  <select
                    id="select-calidad"
                    disabled={descargando}
                    value={varianteActual?.id ?? ""}
                    onChange={(e) => setVarianteId(e.target.value)}
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {fuenteActual.variantes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.etiquetaCalidad}
                        {v.bandwidth ? ` · ${(v.bandwidth / 1_000_000).toFixed(1)} Mbps` : ""}
                      </option>
                    ))}
                  </select>
                  {varianteActual?.codecs ? (
                    <p className="text-muted-foreground text-xs">Códecs: {varianteActual.codecs}</p>
                  ) : null}
                </div>
              ) : null}

              {fuenteActual.variantes.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="select-formato">Formato de salida</Label>
                  <select
                    id="select-formato"
                    disabled={descargando}
                    value={formatoSalida}
                    onChange={(e) => setFormatoSalida(e.target.value as "mp4" | "ts")}
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <option value="mp4">MP4 (.mp4 · Compatible con todo)</option>
                    <option value="ts">MPEG-TS (.ts · Segmentos unidos)</option>
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Conversión directa en navegador sin pérdida de calidad.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="input-nombre">Nombre del archivo</Label>
                <Input
                  id="input-nombre"
                  disabled={descargando}
                  value={nombreArchivo}
                  onChange={(e) => setNombreArchivo(e.target.value)}
                  placeholder="mi-video"
                />
                <p className="text-muted-foreground text-xs">
                  Se guardará como{" "}
                  <code>
                    {(nombreArchivo.trim() || fuenteActual.titulo || "video").replace(
                      /\.(mp4|ts)$/i,
                      ""
                    )}
                    {varianteActual?.height ? `-${varianteActual.height}p` : ""}.{formatoSalida}
                  </code>
                </p>
              </div>
            </div>

            {descargando ? (
              <div className="bg-muted/50 flex flex-col gap-2.5 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2Icon className="size-4 animate-spin text-primary" />
                    {etapaDescarga}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {progreso
                      ? `${progreso.completados}/${progreso.total} seg · ${formatearBytes(
                          progreso.bytesDescargados
                        )} (${porcentaje}%)`
                      : ""}
                  </span>
                </div>
                <div className="bg-secondary h-2.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-all duration-200"
                    style={{ width: `${Math.max(4, porcentaje)}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {fuenteActual.miniaturaUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fuenteActual.miniaturaUrl}
                    alt="Miniatura del video"
                    className="h-14 w-24 rounded border object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                    }}
                  />
                  <span className="text-muted-foreground text-xs">
                    Listo para descargar en{" "}
                    <strong>{varianteActual?.etiquetaCalidad ?? "calidad original"}</strong>
                  </span>
                </div>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                {descargando ? (
                  <Button type="button" variant="destructive" onClick={cancelarDescarga}>
                    <XCircleIcon className="size-4" />
                    Cancelar
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={iniciarDescarga}>
                    <DownloadIcon className="size-4" />
                    Descargar {formatoSalida.toUpperCase()}
                    {varianteActual?.height ? ` (${varianteActual.height}p)` : ""}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {ultimoResultado ? (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="size-5 text-emerald-600" />
                <CardTitle className="text-base">
                  ¡Video listo! — {ultimoResultado.nombreArchivo}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ultimoResultado.calidad}</Badge>
                <Badge variant="secondary">{formatearBytes(ultimoResultado.tamanoBytes)}</Badge>
                <Button
                  size="sm"
                  onClick={() =>
                    dispararDescargaNavegador(
                      ultimoResultado.blobUrl,
                      ultimoResultado.nombreArchivo
                    )
                  }
                >
                  <DownloadIcon className="size-3.5" />
                  Guardar archivo de nuevo
                </Button>
              </div>
            </div>
          </CardHeader>
          {ultimoResultado.formato === "mp4" ? (
            <CardContent>
              <video
                key={ultimoResultado.blobUrl}
                src={ultimoResultado.blobUrl}
                controls
                className="max-h-[420px] w-full rounded-lg border bg-black"
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {historial.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Descargas de esta sesión</CardTitle>
              <CardDescription>
                Archivos procesados recientemente listos para volver a guardar o previsualizar.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                historial.forEach((h) => URL.revokeObjectURL(h.blobUrl))
                setHistorial([])
                setUltimoResultado(null)
              }}
            >
              <Trash2Icon className="size-4" />
              Limpiar historial
            </Button>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {historial.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{item.nombreArchivo}</span>
                    <span className="text-muted-foreground text-xs">
                      {item.calidad} · {formatearBytes(item.tamanoBytes)}
                      {item.duracionSegundos ? ` · ${formatearDuracion(item.duracionSegundos)}` : ""}{" "}
                      · {item.creadoEn}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.formato === "mp4" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setUltimoResultado(item)}
                      >
                        <PlayIcon className="size-3.5" />
                        Ver
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => dispararDescargaNavegador(item.blobUrl, item.nombreArchivo)}
                    >
                      <DownloadIcon className="size-3.5" />
                      Guardar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/**
 * Intenta descargar un segmento o archivo directamente desde el navegador (mas
 * rapido, sin pasar por el servidor). Si el CDN bloquea por CORS, cae
 * automaticamente al proxy interno `/api/descargar-videos?url=...`.
 */
async function descargarRecursoConFallback(
  url: string,
  signal: AbortSignal,
  onProgress?: (bytes: number) => void
): Promise<Uint8Array> {
  const intentar = async (targetUrl: string): Promise<Uint8Array> => {
    const resp = await fetch(targetUrl, { signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    if (!onProgress || !resp.body) {
      return new Uint8Array(await resp.arrayBuffer())
    }
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
        onProgress(total)
      }
    }
    return concatenarBuffers(chunks)
  }

  try {
    return await intentar(url)
  } catch (e) {
    if (signal.aborted) throw e
    const proxyUrl = `/api/descargar-videos?url=${encodeURIComponent(url)}`
    return await intentar(proxyUrl)
  }
}

async function descifrarSegmentoAes128(
  datosCifrados: Uint8Array,
  keyUrl: string,
  ivHex: string | null,
  mediaSequenceIndex: number,
  cacheClaves: Map<string, CryptoKey>,
  signal: AbortSignal
): Promise<Uint8Array> {
  let key = cacheClaves.get(keyUrl)
  if (!key) {
    const rawKey = await descargarRecursoConFallback(keyUrl, signal)
    key = await crypto.subtle.importKey(
      "raw",
      rawKey.buffer as ArrayBuffer,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    )
    cacheClaves.set(keyUrl, key)
  }

  const iv = new Uint8Array(16)
  if (ivHex) {
    const limpio = ivHex.replace(/^0x/i, "").padStart(32, "0")
    for (let i = 0; i < 16; i++) {
      iv[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16)
    }
  } else {
    const view = new DataView(iv.buffer)
    view.setUint32(12, mediaSequenceIndex, false)
  }

  const descifrado = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    datosCifrados.buffer as ArrayBuffer
  )
  return new Uint8Array(descifrado)
}

function dispararDescargaNavegador(blobUrl: string, nombreArchivo: string) {
  const a = document.createElement("a")
  a.href = blobUrl
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatearDuracion(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, "0")}s`
}
