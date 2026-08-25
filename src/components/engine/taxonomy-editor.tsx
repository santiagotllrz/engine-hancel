"use client"

import * as React from "react"

import {
  createCategory,
  createSegment,
  deleteCategory,
  deleteSegment,
  toggleCategory,
  toggleSegment,
  updateCategory,
  updateSegment,
  type ActionResult,
} from "@/app/engine/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { CategoryWithSegments } from "@/lib/engine-data"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

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

  return { pending, error, setError, run }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}

// ------------------------------------------------------------------ dialogos

function CategoryDialog({
  category,
  trigger,
}: {
  category?: CategoryWithSegments
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const { pending, error, run } = useAction()
  const editing = Boolean(category)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form
          action={(formData) =>
            run(
              () => (editing ? updateCategory(formData) : createCategory(formData)),
              () => setOpen(false)
            )
          }
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoria" : "Nueva categoria"}</DialogTitle>
            <DialogDescription>
              Una categoria agrupa segmentos. Su slug se guarda en cada noticia.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {editing ? <input type="hidden" name="id" value={category!.id} /> : null}

            <Field label="Nombre">
              <Input name="name" defaultValue={category?.name} required />
            </Field>

            {editing ? null : (
              <Field
                label="Slug"
                hint="Se escribe en raw_news.niche y no se puede cambiar despues. Ej: Tech"
              >
                <Input name="slug" pattern="[A-Za-z0-9_-]+" required />
              </Field>
            )}

            <Field label="Descripcion">
              <Input name="description" defaultValue={category?.description ?? ""} />
            </Field>

            <Field label="Color" hint="Identifica la categoria en el grafo y en el nucleo.">
              <Input
                type="color"
                name="color"
                defaultValue={category?.color ?? "#8b5cf6"}
                className="h-10 w-24 p-1"
              />
            </Field>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type SegmentRow = CategoryWithSegments["segments"][number]

function SegmentDialog({
  categoryId,
  segment,
  trigger,
}: {
  categoryId: string
  segment?: SegmentRow
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const { pending, error, run } = useAction()
  const editing = Boolean(segment)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form
          action={(formData) =>
            run(
              () => (editing ? updateSegment(formData) : createSegment(formData)),
              () => setOpen(false)
            )
          }
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Editar segmento" : "Nuevo segmento"}</DialogTitle>
            <DialogDescription>
              El segmento es el tema; la keyword es lo que se le pide a Serper.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {editing ? (
              <input type="hidden" name="id" value={segment!.id} />
            ) : (
              <input type="hidden" name="category_id" value={categoryId} />
            )}

            <Field label="Segmento" hint="Se guarda en raw_news.tema. Ej: cybersecurity">
              <Input name="label" defaultValue={segment?.label} required />
            </Field>

            <Field
              label="Keyword de busqueda"
              hint="Consulta literal para Serper. Ej: cybersecurity breach vulnerability hack"
            >
              <Input name="query" defaultValue={segment?.query} required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Idioma (hl)">
                <Input name="hl" defaultValue={segment?.hl ?? "en"} />
              </Field>
              <Field label="Pais (gl)">
                <Input name="gl" defaultValue={segment?.gl ?? "us"} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Resultados">
                <Input type="number" name="num" min={1} max={100} defaultValue={segment?.num ?? 15} />
              </Field>
              <Field label="Ventana" hint="qdr:d = 24h · qdr:w = semana">
                <Input name="freshness" defaultValue={segment?.freshness ?? "qdr:d"} />
              </Field>
            </div>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------------- lista

function SegmentRowView({ segment }: { segment: SegmentRow }) {
  const { pending, run } = useAction()

  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5 pl-4">
      <Switch
        checked={segment.is_active}
        disabled={pending}
        onCheckedChange={(checked) => run(() => toggleSegment(segment.id, Boolean(checked)))}
        aria-label={`Activar ${segment.label}`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${segment.is_active ? "" : "text-muted-foreground line-through"}`}
        >
          {segment.label}
        </p>
        <p className="text-muted-foreground truncate font-mono text-xs">{segment.query}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="font-mono text-[10px]">
          {segment.hl}/{segment.gl} · {segment.num} · {segment.freshness}
        </Badge>
        <SegmentDialog
          categoryId={segment.category_id}
          segment={segment}
          trigger={
            <Button variant="ghost" size="icon" className="size-8" aria-label="Editar segmento">
              <PencilIcon />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-8"
          aria-label="Borrar segmento"
          disabled={pending}
          onClick={() => run(() => deleteSegment(segment.id))}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  )
}

function CategoryCard({ category }: { category: CategoryWithSegments }) {
  const { pending, run } = useAction()
  const active = category.segments.filter((segment) => segment.is_active).length

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-3 pb-3">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: category.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={`text-base font-semibold ${category.is_active ? "" : "text-muted-foreground"}`}
            >
              {category.name}
            </h2>
            <Badge variant="outline" className="font-mono text-[10px]">
              {category.slug}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {active}/{category.segments.length} segmentos activos
            </span>
          </div>
          {category.description ? (
            <p className="text-muted-foreground mt-0.5 text-sm">{category.description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Switch
            checked={category.is_active}
            disabled={pending}
            onCheckedChange={(checked) => run(() => toggleCategory(category.id, Boolean(checked)))}
            aria-label={`Activar ${category.name}`}
          />
          <CategoryDialog
            category={category}
            trigger={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Editar categoria">
                <PencilIcon />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-8"
            aria-label="Borrar categoria"
            disabled={pending}
            onClick={() => run(() => deleteCategory(category.id))}
          >
            <Trash2Icon />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="divide-y border-l-2" style={{ borderColor: `${category.color}55` }}>
          {category.segments.length === 0 ? (
            <p className="text-muted-foreground py-3 pl-4 text-sm">
              Sin segmentos todavia.
            </p>
          ) : (
            category.segments.map((segment) => (
              <SegmentRowView key={segment.id} segment={segment} />
            ))
          )}
        </div>

        <SegmentDialog
          categoryId={category.id}
          trigger={
            <Button variant="ghost" size="sm" className="mt-2 ml-2">
              <PlusIcon />
              Añadir segmento
            </Button>
          }
        />
      </CardContent>
    </Card>
  )
}

export function TaxonomyEditor({ taxonomy }: { taxonomy: CategoryWithSegments[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Solo se buscan los segmentos activos dentro de categorias activas.
        </p>
        <CategoryDialog
          trigger={
            <Button size="sm">
              <PlusIcon />
              Nueva categoria
            </Button>
          }
        />
      </div>

      {taxonomy.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No hay categorias. Crea la primera para empezar a configurar el motor.
          </CardContent>
        </Card>
      ) : (
        taxonomy.map((category) => <CategoryCard key={category.id} category={category} />)
      )}
    </div>
  )
}
