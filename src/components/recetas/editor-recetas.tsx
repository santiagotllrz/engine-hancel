"use client"

import * as React from "react"
import { CopyIcon, PlusIcon, SparklesIcon, Trash2Icon, PencilIcon } from "lucide-react"

import {
  alternarReceta,
  borrarReceta,
  duplicarReceta,
  generarAhora,
  guardarReceta,
  type CamposReceta,
} from "@/app/recetas/actions"
import type { RecetaVista } from "@/lib/recetas-data"
import { CANALES, canalPorId, formatoPorId } from "@/lib/canales-catalogo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Las horas que se ofrecen para programar una receta. */
const HORAS = Array.from({ length: 18 }, (_, i) => i + 5) // 5:00 a 22:00

type Pilar = { id: string; name: string }
/** Lo que el formulario necesita de un estilo grafico para ofrecerlo. */
export type PlantillaOpcion = { id: string; name: string; tipo: string }

/**
 * Las recetas del bloque 2: cada una le dice al agente de contenido que producir.
 *
 * La lista muestra lo esencial de cada una y deja dispararla a mano; el
 * formulario, en un dialogo, crea y edita. Canal manda sobre formato: al cambiar
 * de canal, el formato se resetea a los de ese canal, que es lo que garantiza que
 * nunca se guarde un formato que no existe en la red elegida.
 */
export function EditorRecetas({
  recetas,
  pilares,
  plantillas,
}: {
  recetas: RecetaVista[]
  pilares: Pilar[]
  plantillas: PlantillaOpcion[]
}) {
  const [abierto, setAbierto] = React.useState(false)
  const [editando, setEditando] = React.useState<RecetaVista | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const abrirNueva = () => {
    setEditando(null)
    setError(null)
    setAbierto(true)
  }
  const abrirEdicion = (r: RecetaVista) => {
    setEditando(r)
    setError(null)
    setAbierto(true)
  }

  const guardar = (campos: CamposReceta) => {
    setError(null)
    startTransition(async () => {
      const r = await guardarReceta(campos)
      if (!r.ok) setError(r.error)
      else setAbierto(false)
    })
  }

  const borrar = (id: string) => {
    startTransition(async () => {
      await borrarReceta(id)
    })
  }

  const duplicar = (id: string) => {
    setAviso(null)
    startTransition(async () => {
      const r = await duplicarReceta(id)
      setAviso(r.ok ? "Receta duplicada. La copia queda apagada hasta que la enciendas." : `Error: ${r.error}`)
    })
  }

  const alternar = (id: string, enabled: boolean) => {
    startTransition(async () => {
      await alternarReceta(id, enabled)
    })
  }

  const disparar = (id: string) => {
    setAviso(null)
    startTransition(async () => {
      const r = await generarAhora(id)
      if (!r.ok) setAviso(`Error: ${r.error}`)
      else if (r.generadas > 0) setAviso(`Listo: ${r.generadas} piezas${r.errores ? `, ${r.errores} con error` : ""}.`)
      else setAviso(r.motivo ? `Sin piezas: ${r.motivo}.` : "No se genero ninguna pieza.")
    })
  }

  if (pilares.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
        No hay pilares todavia. Crea un pilar en Capas antes de armar una receta.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {recetas.length} {recetas.length === 1 ? "receta" : "recetas"}
        </p>
        <Button onClick={abrirNueva} disabled={pending}>
          <PlusIcon className="size-4" />
          Nueva receta
        </Button>
      </div>

      {aviso ? <p className="text-sm">{aviso}</p> : null}

      {recetas.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
          Sin recetas. Una receta define de que pilar sacar ideas, para que canal y formato, cuantas
          al dia y a que horas.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {recetas.map((r) => (
            <FilaReceta
              key={r.id}
              receta={r}
              disabled={pending}
              onEditar={() => abrirEdicion(r)}
              onBorrar={() => borrar(r.id)}
              onDuplicar={() => duplicar(r.id)}
              onAlternar={(v) => alternar(r.id, v)}
              onGenerar={() => disparar(r.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar receta" : "Nueva receta"}</DialogTitle>
          </DialogHeader>
          <FormReceta
            key={editando?.id ?? "nueva"}
            receta={editando}
            pilares={pilares}
            plantillas={plantillas}
            disabled={pending}
            error={error}
            onGuardar={guardar}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilaReceta({
  receta,
  disabled,
  onEditar,
  onBorrar,
  onDuplicar,
  onAlternar,
  onGenerar,
}: {
  receta: RecetaVista
  disabled: boolean
  onEditar: () => void
  onBorrar: () => void
  onDuplicar: () => void
  onAlternar: (v: boolean) => void
  onGenerar: () => void
}) {
  const fmt = formatoPorId(receta.format)
  const horas = receta.run_at.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-40 flex-1">
          <p className="text-sm font-medium">{receta.name}</p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {receta.pillarName} · {fmt ? `${fmt.canal.nombre} / ${fmt.formato.nombre}` : receta.format}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="outline">{receta.per_day}/dia</Badge>
            {horas ? <Badge variant="outline">{horas}</Badge> : <Badge variant="outline">sin horario</Badge>}
            <Badge variant="secondary">
              {receta.generator === "canva"
                ? receta.templateName
                  ? `Canva · ${receta.templateName}`
                  : "Canva · sin estilo"
                : "Solo texto"}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {receta.piezas} piezas
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Switch
            checked={receta.enabled}
            disabled={disabled}
            onCheckedChange={onAlternar}
            aria-label="Encender la receta"
          />
          <Button variant="ghost" size="icon" disabled={disabled} onClick={onGenerar} title="Generar ahora" aria-label="Generar ahora">
            <SparklesIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={disabled} onClick={onEditar} aria-label="Editar">
            <PencilIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={disabled} onClick={onDuplicar} title="Duplicar" aria-label="Duplicar">
            <CopyIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onBorrar}
            aria-label="Borrar"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function FormReceta({
  receta,
  pilares,
  plantillas,
  disabled,
  error,
  onGuardar,
}: {
  receta: RecetaVista | null
  pilares: Pilar[]
  plantillas: PlantillaOpcion[]
  disabled: boolean
  error: string | null
  onGuardar: (campos: CamposReceta) => void
}) {
  const [name, setName] = React.useState(receta?.name ?? "")
  const [pillarId, setPillarId] = React.useState(receta?.pillar_id ?? pilares[0]?.id ?? "")
  const [channel, setChannel] = React.useState(receta?.channel ?? CANALES[0].id)
  const [format, setFormat] = React.useState(
    receta?.format ?? CANALES[0].formatos[0].id
  )
  const [generator, setGenerator] = React.useState(receta?.generator ?? "canva")
  const [perDay, setPerDay] = React.useState(String(receta?.per_day ?? 1))
  const [runAt, setRunAt] = React.useState<Set<number>>(new Set(receta?.run_at ?? [9]))
  const [templateId, setTemplateId] = React.useState(receta?.templateId ?? "")

  const canal = canalPorId(channel) ?? CANALES[0]
  const formatoActual = formatoPorId(format)
  const admitePlantilla = formatoActual?.formato.conPlantilla ?? false

  const cambiarCanal = (nuevo: string) => {
    setChannel(nuevo)
    const c = canalPorId(nuevo)
    if (c && !c.formatos.some((f) => f.id === format)) setFormat(c.formatos[0].id)
  }

  const alternarHora = (h: number) => {
    setRunAt((prev) => {
      const next = new Set(prev)
      if (next.has(h)) next.delete(h)
      else next.add(h)
      return next
    })
  }

  const enviar = () => {
    onGuardar({
      id: receta?.id,
      name,
      pillar_id: pillarId,
      channel,
      format,
      generator,
      per_day: Number(perDay) || 1,
      run_at: [...runAt],
      template_id: plantillas.some((t) => t.id === templateId) ? templateId : null,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rec-name">Nombre</Label>
        <Input id="rec-name" value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} placeholder="Carrusel educativo de suelos" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Pilar</Label>
          <Select value={pillarId} onValueChange={(v) => setPillarId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => pilares.find((p) => p.id === pillarId)?.name ?? "Elegir"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pilares.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Piezas al dia</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={perDay}
            disabled={disabled}
            onChange={(e) => setPerDay(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Canal</Label>
          <Select value={channel} onValueChange={(v) => cambiarCanal(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => canal.nombre}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CANALES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Formato</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => formatoActual?.formato.nombre ?? "Elegir"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {canal.formatos.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Horas (zona de la cuenta)</Label>
        <div className="flex flex-wrap gap-1.5">
          {HORAS.map((h) => (
            <button
              key={h}
              type="button"
              disabled={disabled}
              onClick={() => alternarHora(h)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                runAt.has(h)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              {String(h).padStart(2, "0")}:00
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Generador</Label>
        <Select value={generator} onValueChange={(v) => setGenerator(v as string)}>
          <SelectTrigger className="w-full">
            <SelectValue>{() => (generator === "canva" ? "Canva (imagen)" : "Ninguno (solo texto)")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="canva">Canva (imagen)</SelectItem>
            <SelectItem value="ninguno">Ninguno (solo texto)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {generator === "canva" && admitePlantilla ? (
        <div className="flex flex-col gap-1.5">
          <Label>Estilo gráfico</Label>
          <Select value={templateId} onValueChange={(v) => setTemplateId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => plantillas.find((t) => t.id === templateId)?.name ?? "Elegir estilo"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {plantillas.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Los estilos se ajustan en Capas → Estilo. Sirven para cualquier formato.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
        <Button onClick={enviar} disabled={disabled || !name.trim()}>
          {receta ? "Guardar" : "Crear receta"}
        </Button>
      </DialogFooter>
    </div>
  )
}
