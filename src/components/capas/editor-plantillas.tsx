"use client"

import * as React from "react"
import { ExternalLinkIcon, PencilIcon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon } from "lucide-react"

import {
  borrarPlantilla,
  construirPlantilla,
  guardarPlantilla,
  releerPlantilla,
} from "@/app/capas/plantillas-actions"
import type { PlantillaVista } from "@/lib/plantillas-data"
import { CANALES, formatoPorId } from "@/lib/canales-catalogo"
import {
  admitePlantilla,
  ESTILO_POR_DEFECTO,
  FUENTES_PLANTILLA,
  type EstiloPlantilla,
} from "@/lib/plantillas-catalogo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

/** Formatos que admiten plantilla, con su canal delante para distinguirlos. */
const FORMATOS = CANALES.flatMap((c) =>
  c.formatos.filter((f) => admitePlantilla(f.id)).map((f) => ({ id: f.id, nombre: `${c.nombre} · ${f.nombre}` }))
)

const ESTADO: Record<PlantillaVista["status"], { texto: string; clase: string }> = {
  borrador: { texto: "Sin construir", clase: "text-muted-foreground" },
  creando: { texto: "Construyendo en Canva…", clase: "text-amber-600" },
  lista: { texto: "Lista", clase: "text-emerald-600" },
  error: { texto: "Con error", clase: "text-destructive" },
}

/**
 * La capa Plantilla.
 *
 * Una plantilla se define con valores (colores, tipografia, cuantas laminas,
 * como es la portada y el cierre) y el sistema la construye en Canva como un
 * diseno maestro. Cada pieza copia ese maestro: por eso el estilo sale igual
 * siempre. Una vez construida se puede abrir en Canva y retocarla a mano; con
 * "Releer" el sistema vuelve a leerla.
 */
export function EditorPlantillas({ plantillas }: { plantillas: PlantillaVista[] }) {
  const [abierto, setAbierto] = React.useState(false)
  const [editando, setEditando] = React.useState<PlantillaVista | null>(null)
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupada, setOcupada] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const accion = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    setAviso(null)
    setOcupada(id)
    startTransition(async () => {
      try {
        const r = await fn()
        setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error ?? "Fallo." })
      } catch {
        setAviso({ ok: false, texto: "No respondio. Puede seguir trabajando en Canva: recarga en un momento." })
      } finally {
        setOcupada(null)
      }
    })
  }

  const guardar = (campos: { name: string; format: string; estilo: EstiloPlantilla }, construir: boolean) => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarPlantilla({ id: editando?.id, ...campos })
      if (!r.ok) {
        setAviso({ ok: false, texto: r.error })
        return
      }
      setAbierto(false)
      if (construir && r.id) {
        setOcupada(r.id)
        try {
          const c = await construirPlantilla(r.id)
          setAviso(c.ok ? { ok: true, texto: "Plantilla construida en Canva." } : { ok: false, texto: c.error })
        } finally {
          setOcupada(null)
        }
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Plantillas</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            El estilo fijo de cada formato. El sistema la construye en Canva y cada pieza es una copia
            con su texto y sus fotos.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditando(null)
            setAbierto(true)
          }}
          disabled={pending}
        >
          <PlusIcon className="size-4" />
          Nueva plantilla
        </Button>
      </div>

      {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}

      {plantillas.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
          Sin plantillas. Crea una para que las recetas de Canva dibujen sus piezas.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plantillas.map((p) => {
            const fmt = formatoPorId(p.format)
            const trabajando = ocupada === p.id || p.status === "creando"
            const laminas = p.estructura?.paginas.length ?? 0
            return (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-center gap-4 py-3">
                  <div className="bg-muted flex h-24 w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-md border">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MiniLamina estilo={p.estilo} rol="portada" />
                    )}
                  </div>
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {fmt ? `${fmt.canal.nombre} · ${fmt.formato.nombre}` : p.format}
                      {laminas ? ` · hasta ${laminas} láminas` : ""}
                    </p>
                    <p className={`mt-1 text-xs ${trabajando ? ESTADO.creando.clase : ESTADO[p.status].clase}`}>
                      {trabajando ? ESTADO.creando.texto : ESTADO[p.status].texto}
                      {p.status === "error" && p.error ? `: ${p.error}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {p.canvaEditUrl ? (
                      <Button variant="outline" size="sm" render={<a href={p.canvaEditUrl} target="_blank" rel="noreferrer" />}>
                        <ExternalLinkIcon className="size-3.5" />
                        Abrir en Canva
                      </Button>
                    ) : null}
                    <Button
                      variant={p.status === "lista" ? "ghost" : "default"}
                      size="sm"
                      disabled={pending}
                      onClick={() => accion(p.id, () => construirPlantilla(p.id), "Plantilla construida en Canva.")}
                      title="Crea en Canva el diseño maestro con estos valores"
                    >
                      <SparklesIcon className="size-3.5" />
                      {p.canvaDesignId ? "Reconstruir" : "Construir en Canva"}
                    </Button>
                    {p.canvaDesignId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => accion(p.id, () => releerPlantilla(p.id), "Plantilla releída desde Canva.")}
                        title="Después de retocarla a mano en Canva"
                      >
                        <RefreshCwIcon className="size-3.5" />
                        Releer
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        setEditando(p)
                        setAbierto(true)
                      }}
                      aria-label="Editar"
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => accion(p.id, () => borrarPlantilla(p.id), "Plantilla borrada.")}
                      aria-label="Borrar"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <FormPlantilla key={editando?.id ?? "nueva"} plantilla={editando} disabled={pending} onGuardar={guardar} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- formulario

function FormPlantilla({
  plantilla,
  disabled,
  onGuardar,
}: {
  plantilla: PlantillaVista | null
  disabled: boolean
  onGuardar: (campos: { name: string; format: string; estilo: EstiloPlantilla }, construir: boolean) => void
}) {
  const [name, setName] = React.useState(plantilla?.name ?? "")
  const [format, setFormat] = React.useState(plantilla?.format ?? "ig_carrusel")
  const [e, setE] = React.useState<EstiloPlantilla>(plantilla?.estilo ?? ESTILO_POR_DEFECTO)

  const set = <K extends keyof EstiloPlantilla>(clave: K, valor: EstiloPlantilla[K]) => setE((x) => ({ ...x, [clave]: valor }))
  const esCarrusel = ["ig_carrusel", "fb_carrusel", "li_documento"].includes(format)
  const fmt = formatoPorId(format)
  const proporcion = fmt ? `${fmt.formato.ancho} / ${fmt.formato.alto}` : "4 / 5"

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_240px]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre">
            <Input value={name} disabled={disabled} onChange={(ev) => setName(ev.target.value)} placeholder="Carrusel Agro negro" />
          </Campo>
          <Campo label="Formato">
            <Select value={format} onValueChange={(v) => setFormat(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => FORMATOS.find((f) => f.id === format)?.nombre ?? "Elegir"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FORMATOS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>

        <Seccion titulo="Estilo">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["fondo", "Fondo"],
                ["texto", "Texto"],
                ["textoSuave", "Texto suave"],
                ["acento", "Acento"],
              ] as const
            ).map(([clave, etiqueta]) => (
              <Campo key={clave} label={etiqueta}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={e.colores[clave]}
                    disabled={disabled}
                    onChange={(ev) => set("colores", { ...e.colores, [clave]: ev.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                  />
                  <span className="text-muted-foreground font-mono text-xs">{e.colores[clave]}</span>
                </div>
              </Campo>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Tipografía">
              <Select value={e.fuente} onValueChange={(v) => set("fuente", v as EstiloPlantilla["fuente"])}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => e.fuente}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FUENTES_PLANTILLA.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            {esCarrusel ? (
              <Campo label={`Láminas de contenido: ${e.laminasContenido} (total hasta ${e.laminasContenido + 2})`}>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={e.laminasContenido}
                  disabled={disabled}
                  onChange={(ev) => set("laminasContenido", Number(ev.target.value))}
                  className="w-full"
                />
              </Campo>
            ) : null}
          </div>
        </Seccion>

        <Seccion titulo={esCarrusel ? "Portada" : "La pieza"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Interruptor label="Foto de fondo" checked={e.portada.foto} disabled={disabled} onChange={(v) => set("portada", { ...e.portada, foto: v })} />
            <Interruptor label="Logo" checked={e.portada.logo} disabled={disabled} onChange={(v) => set("portada", { ...e.portada, logo: v })} />
            {e.portada.foto ? (
              <Campo label={`Oscurecer la foto: ${Math.round(e.portada.velo * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={e.portada.velo}
                  disabled={disabled}
                  onChange={(ev) => set("portada", { ...e.portada, velo: Number(ev.target.value) })}
                  className="w-full"
                />
              </Campo>
            ) : null}
            <Campo label={`Tamaño del titular: ${e.portada.tamanoHook}px`}>
              <input
                type="range"
                min={56}
                max={100}
                value={e.portada.tamanoHook}
                disabled={disabled}
                onChange={(ev) => set("portada", { ...e.portada, tamanoHook: Number(ev.target.value) })}
                className="w-full"
              />
            </Campo>
            {esCarrusel ? (
              <>
                <Campo label="Posición del titular">
                  <Select value={e.portada.posicionTexto} onValueChange={(v) => set("portada", { ...e.portada, posicionTexto: v as "abajo" | "centro" })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{() => (e.portada.posicionTexto === "abajo" ? "Abajo" : "Centro")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="abajo">Abajo</SelectItem>
                      <SelectItem value="centro">Centro</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo label="Invitación a deslizar">
                  <Input
                    value={e.portada.textoDesliza}
                    disabled={disabled}
                    onChange={(ev) => set("portada", { ...e.portada, textoDesliza: ev.target.value })}
                    placeholder="Vacío para no ponerla"
                  />
                </Campo>
              </>
            ) : null}
          </div>
        </Seccion>

        {esCarrusel ? (
          <>
            <Seccion titulo="Láminas de contenido">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Foto">
                  <Select value={e.contenido.foto} onValueChange={(v) => set("contenido", { ...e.contenido, foto: v as EstiloPlantilla["contenido"]["foto"] })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {() => ({ arriba: "Arriba, texto debajo", fondo: "De fondo, oscurecida", ninguna: "Sin foto" })[e.contenido.foto]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arriba">Arriba, texto debajo</SelectItem>
                      <SelectItem value="fondo">De fondo, oscurecida</SelectItem>
                      <SelectItem value="ninguna">Sin foto</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
                <Interruptor label="Numeración (02 / 07)" checked={e.contenido.numeracion} disabled={disabled} onChange={(v) => set("contenido", { ...e.contenido, numeracion: v })} />
              </div>
            </Seccion>

            <Seccion titulo="Última lámina">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Quién la escribe">
                  <Select value={e.cierre.modo} onValueChange={(v) => set("cierre", { ...e.cierre, modo: v as "agente" | "fijo" })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{() => (e.cierre.modo === "agente" ? "El agente, con el CTA" : "Siempre la misma")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agente">El agente, con el CTA</SelectItem>
                      <SelectItem value="fijo">Siempre la misma</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
                <Interruptor label="Logo" checked={e.cierre.logo} disabled={disabled} onChange={(v) => set("cierre", { ...e.cierre, logo: v })} />
                {e.cierre.modo === "fijo" ? (
                  <>
                    <Campo label="Título">
                      <Input value={e.cierre.titulo} disabled={disabled} onChange={(ev) => set("cierre", { ...e.cierre, titulo: ev.target.value })} />
                    </Campo>
                    <Campo label="Texto">
                      <Input value={e.cierre.texto} disabled={disabled} onChange={(ev) => set("cierre", { ...e.cierre, texto: ev.target.value })} />
                    </Campo>
                  </>
                ) : null}
              </div>
            </Seccion>
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={disabled || !name.trim()} onClick={() => onGuardar({ name, format, estilo: e }, false)}>
            Solo guardar
          </Button>
          <Button disabled={disabled || !name.trim()} onClick={() => onGuardar({ name, format, estilo: e }, true)}>
            <SparklesIcon className="size-4" />
            Guardar y construir en Canva
          </Button>
        </div>
      </div>

      {/* Vista previa: el esquema de cada tipo de lámina con los valores elegidos. */}
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Vista previa</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <MiniLamina estilo={e} rol="portada" proporcion={proporcion} etiqueta={esCarrusel ? "Portada" : "Pieza"} />
          {esCarrusel ? (
            <>
              <MiniLamina estilo={e} rol="contenido" proporcion={proporcion} etiqueta="Contenido" />
              <MiniLamina estilo={e} rol="cierre" proporcion={proporcion} etiqueta="Cierre" />
            </>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Es un esquema. El diseño real se ve en Canva al construirla, y se puede retocar ahí.
        </p>
      </div>
    </div>
  )
}

/** El esquema de una lámina con los colores y la disposicion de la plantilla. */
function MiniLamina({
  estilo: e,
  rol,
  proporcion = "4 / 5",
  etiqueta,
}: {
  estilo: EstiloPlantilla
  rol: "portada" | "contenido" | "cierre"
  proporcion?: string
  etiqueta?: string
}) {
  const foto = "linear-gradient(135deg, #4d6b3a 0%, #2f4a25 45%, #6b8f4e 100%)"
  const barra = (ancho: string, alto: number, color: string) => (
    <div style={{ width: ancho, height: alto, background: color, borderRadius: 2 }} />
  )

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative w-full overflow-hidden rounded-md border"
        style={{ aspectRatio: proporcion, background: e.colores.fondo }}
      >
        {rol === "portada" ? (
          <>
            {e.portada.foto ? <div className="absolute inset-0" style={{ background: foto }} /> : null}
            {e.portada.foto ? <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${e.portada.velo})` }} /> : null}
            {e.portada.logo ? <div className="absolute top-[7%] left-[7%]">{barra("18%", 5, e.colores.texto)}</div> : null}
            <div className={`absolute right-[7%] left-[7%] flex flex-col gap-1 ${e.portada.posicionTexto === "centro" ? "top-[40%]" : "top-[56%]"}`}>
              {barra("90%", Math.max(5, e.portada.tamanoHook / 11), e.colores.texto)}
              {barra("70%", Math.max(5, e.portada.tamanoHook / 11), e.colores.texto)}
            </div>
            {e.portada.textoDesliza ? <div className="absolute bottom-[8%] left-[7%] w-full">{barra("22%", 3, e.colores.textoSuave)}</div> : null}
          </>
        ) : null}
        {rol === "contenido" ? (
          <>
            {e.contenido.foto === "arriba" ? <div className="absolute inset-x-0 top-0 h-[47%]" style={{ background: foto }} /> : null}
            {e.contenido.foto === "fondo" ? (
              <>
                <div className="absolute inset-0" style={{ background: foto }} />
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${Math.max(0.6, e.portada.velo)})` }} />
              </>
            ) : null}
            <div
              className="absolute right-[7%] left-[7%] flex flex-col gap-1"
              style={{ top: e.contenido.foto === "arriba" ? "54%" : e.contenido.foto === "fondo" ? "50%" : "22%" }}
            >
              {e.contenido.numeracion ? barra("16%", 3, e.colores.acento) : null}
              {barra("85%", 6, e.colores.texto)}
              {barra("60%", 6, e.colores.texto)}
              <div className="h-1" />
              {barra("90%", 3, e.colores.textoSuave)}
              {barra("80%", 3, e.colores.textoSuave)}
              {barra("70%", 3, e.colores.textoSuave)}
            </div>
          </>
        ) : null}
        {rol === "cierre" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-[10%]">
            {e.cierre.logo ? barra("26%", 8, e.colores.texto) : null}
            <div className="h-2" />
            {barra("80%", 7, e.colores.texto)}
            {barra("55%", 7, e.colores.texto)}
            <div className="h-1" />
            {barra("70%", 3, e.colores.textoSuave)}
          </div>
        ) : null}
      </div>
      {etiqueta ? <p className="text-muted-foreground text-xs">{etiqueta}</p> : null}
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{titulo}</p>
      {children}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Interruptor({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      {label}
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  )
}
