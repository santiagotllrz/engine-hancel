"use client"

import * as React from "react"

import {
  approvePiece,
  discardAngle,
  generateFromAngle,
  publishPieceNow,
  regenerateCarousel,
  rejectPiece,
  updatePiece,
  type ActionResult,
  type Network,
} from "@/app/contenido/actions"
import { SendToPipelineButton } from "@/components/contenido/send-to-pipeline-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AngleView, PieceView } from "@/lib/content-data"
import { formatDateTime } from "@/lib/format"
import type { RawNews } from "@/lib/types"
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  DownloadIcon,
  ImagesIcon,
  RefreshCwIcon,
  SendIcon,
  XIcon,
} from "lucide-react"

/** Envuelve una accion de servidor con estado pendiente y mensaje de error. */
function useAction() {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const run = React.useCallback(
    (action: () => Promise<ActionResult>, onDone?: () => void) => {
      setError(null)
      startTransition(async () => {
        const result = await action()
        if (result.ok) onDone?.()
        else setError(result.error)
      })
    },
    []
  )

  return { pending, error, run }
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="text-muted-foreground py-10 text-center text-sm">
        {children}
      </CardContent>
    </Card>
  )
}

export function ContentStudio({
  candidates,
  angles,
  pieces,
  hasThreshold,
  linkedinConnected,
  instagramListo,
}: {
  candidates: RawNews[]
  angles: AngleView[]
  pieces: PieceView[]
  hasThreshold: boolean
  linkedinConnected: boolean
  /** Buffer configurado y con canal elegido. */
  instagramListo: boolean
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Candidatas</h2>
        {!hasThreshold ? (
          <Vacio>
            No hay umbral de score definido todavia. Ponlo en Variables para que aparezcan
            candidatas aqui — o manda cualquier noticia al pipeline desde Noticias, que eso
            funciona siempre.
          </Vacio>
        ) : candidates.length === 0 ? (
          <Vacio>Ninguna noticia analizada supera el umbral y esta sin procesar.</Vacio>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((news) => (
              <Card key={news.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{news.title}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {news.niche} · {news.tema} · {news.source ?? "sin fuente"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-mono">
                    {news.relevance_score ?? "—"}
                  </Badge>
                  <SendToPipelineButton rawNewsId={news.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Angulos</h2>
        {angles.length === 0 ? (
          <Vacio>
            Todavia no hay angulos. Manda una noticia al pipeline y apareceran cuando la rutina
            responda.
          </Vacio>
        ) : (
          <div className="flex flex-col gap-2">
            {angles.map((angle) => (
              <AngleCard key={angle.id} angle={angle} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Piezas</h2>
        {pieces.length === 0 ? (
          <Vacio>Aun no hay posts generados.</Vacio>
        ) : (
          <div className="flex flex-col gap-3">
            {pieces.map((piece) => (
              <PieceCard
                key={piece.id}
                piece={piece}
                linkedinConnected={linkedinConnected}
                instagramListo={instagramListo}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Un angulo alimenta las dos redes por separado.
 *
 * Cada red se mira por su cuenta: tener ya el post de LinkedIn no impide generar
 * el carrusel de Instagram del mismo angulo, que es justamente para lo que se
 * decide el angulo una sola vez.
 */
function AngleCard({ angle }: { angle: AngleView }) {
  const { pending, error, run } = useAction()

  const generada = (network: Network) => angle.pieces.some((p) => p.network === network)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{angle.angle}</p>
            {angle.thesis ? (
              <p className="text-muted-foreground mt-1 text-sm">{angle.thesis}</p>
            ) : null}
            <p className="text-muted-foreground mt-1.5 truncate text-xs">
              {angle.news ? angle.news.title : "noticia eliminada"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {angle.playbook_format ? (
              <Badge variant="outline">{angle.playbook_format}</Badge>
            ) : null}
            <Badge variant={angle.status === "generated" ? "default" : "secondary"}>
              {angle.status}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["linkedin", "instagram"] as const).map((network) => {
            const hecha = generada(network)
            return (
              <Button
                key={network}
                size="sm"
                variant={network === "linkedin" ? "default" : "secondary"}
                disabled={pending || hecha}
                onClick={() => run(() => generateFromAngle(angle.id, network))}
              >
                {network === "linkedin" ? <FileTextIcon /> : <ImagesIcon />}
                {hecha
                  ? network === "linkedin"
                    ? "Post hecho"
                    : "Carrusel hecho"
                  : network === "linkedin"
                    ? "Generar post"
                    : "Generar carrusel"}
              </Button>
            )
          })}
          {angle.status !== "discarded" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => discardAngle(angle.id))}
            >
              Descartar
            </Button>
          ) : null}
          {error ? <span className="text-destructive text-xs">{error}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function PieceCard({
  piece,
  linkedinConnected,
  instagramListo,
}: {
  piece: PieceView
  linkedinConnected: boolean
  instagramListo: boolean
}) {
  const { pending, error, run } = useAction()
  const [editando, setEditando] = React.useState(false)
  const [copiado, setCopiado] = React.useState(false)

  // Cada red guarda su propia forma en `payload`: LinkedIn un texto, Instagram
  // un caption con la lista ordenada de imagenes.
  const esCarrusel = piece.network === "instagram"
  const carrusel = esCarrusel
    ? (piece.payload as unknown as {
        caption?: string
        hashtags?: string[]
        images?: string[]
        slideCount?: number
        portadaSinFoto?: boolean
      })
    : null

  const payload = piece.payload ?? { hook: null, body: "", hashtags: [], cta: null, notas: null }
  const textoCompleto = esCarrusel
    ? [carrusel?.caption, (carrusel?.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n")
    : [payload.hook, payload.body, (payload.hashtags ?? []).join(" ")]
        .filter(Boolean)
        .join("\n\n")

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={piece.status === "rejected" ? "outline" : "default"}>
              {piece.status === "published"
                ? "Publicada"
                : piece.status === "approved"
                  ? "Aprobada"
                  : piece.status === "rejected"
                    ? "Rechazada"
                    : "Por revisar"}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {piece.network}
            </Badge>
            {piece.linkedin_urn ? (
              <a
                href={`https://www.linkedin.com/feed/update/${piece.linkedin_urn}/`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                ver en LinkedIn
              </a>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatDateTime(piece.generated_at ?? piece.created_at)}
            </span>
          </div>
          {piece.news ? (
            <a
              href={piece.news.link}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <ExternalLinkIcon className="size-3" />
              la noticia
            </a>
          ) : null}
        </div>

        {editando ? (
          <form
            action={(formData) => run(() => updatePiece(formData), () => setEditando(false))}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="piece_id" value={piece.id} />
            <Textarea name="hook" rows={2} defaultValue={payload.hook ?? ""} placeholder="Hook" />
            <Textarea name="body" rows={10} defaultValue={payload.body} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditando(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : esCarrusel ? (
          <div className="flex flex-col gap-3">
            {/* Las imagenes en fila y con scroll: es el orden del carrusel y se
                lee igual que se vera en Instagram. */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(carrusel?.images ?? []).map((src, i) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="relative shrink-0"
                  title={`Lamina ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Lamina ${i + 1} del carrusel`}
                    className="h-40 w-32 rounded-md border object-cover"
                    loading="lazy"
                  />
                  <span className="bg-background/85 absolute bottom-1 left-1 rounded px-1 text-[10px] font-medium">
                    {i + 1}
                  </span>
                </a>
              ))}
            </div>
            {carrusel?.portadaSinFoto ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                La portada salio sin foto: ni el banco ni la noticia dieron una. Regenera
                para volver a intentarlo.
              </p>
            ) : null}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{carrusel?.caption}</p>
            {(carrusel?.hashtags ?? []).length > 0 ? (
              <p className="text-muted-foreground text-xs">{carrusel?.hashtags?.join(" ")}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {payload.hook ? <p className="text-sm font-medium">{payload.hook}</p> : null}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{payload.body}</p>
            {(payload.hashtags ?? []).length > 0 ? (
              <p className="text-muted-foreground text-xs">{payload.hashtags.join(" ")}</p>
            ) : null}
          </div>
        )}

        {!editando ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              size="sm"
              disabled={pending || piece.status === "approved"}
              onClick={() => run(() => approvePiece(piece.id))}
            >
              <CheckIcon />
              Aprobar
            </Button>
            {!esCarrusel ? (
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                Editar
              </Button>
            ) : null}
            {esCarrusel ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  render={<a href={`/api/content/carousel?piece=${piece.id}`} download />}
                >
                  <DownloadIcon />
                  Descargar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || piece.published_at !== null}
                  title="Vuelve a dibujar y subir las imagenes desde el guion original"
                  onClick={() => run(() => regenerateCarousel(piece.id))}
                >
                  <RefreshCwIcon />
                  Regenerar
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(textoCompleto)
                setCopiado(true)
                window.setTimeout(() => setCopiado(false), 2000)
              }}
            >
              <CopyIcon />
              {copiado ? "Copiado" : "Copiar"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                pending ||
                piece.published_at !== null ||
                (esCarrusel ? !instagramListo : !linkedinConnected)
              }
              title={
                esCarrusel
                  ? instagramListo
                    ? "Publica el carrusel en Instagram via Buffer"
                    : "Elige el canal de Buffer en Variables"
                  : !linkedinConnected
                    ? "Conecta una cuenta de LinkedIn en Variables"
                    : undefined
              }
              onClick={() => run(() => publishPieceNow(piece.id))}
            >
              <SendIcon />
              {piece.published_at ? "Publicada" : "Publicar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || piece.status === "rejected"}
              onClick={() => run(() => rejectPiece(piece.id))}
            >
              <XIcon />
              Rechazar
            </Button>
            {error ? <span className="text-destructive text-xs">{error}</span> : null}
            {!error && piece.publish_error ? (
              <span className="text-destructive text-xs">{piece.publish_error}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
