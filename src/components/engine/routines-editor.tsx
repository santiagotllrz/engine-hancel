"use client"

import * as React from "react"

import {
  createRoutine,
  deleteRoutine,
  testRoutine,
  toggleRoutine,
  updateRoutine,
  type ActionResult,
} from "@/app/engine/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { formatDateTime } from "@/lib/format"
import type { RoutineView } from "@/lib/engine-data"
import { PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"

const KINDS = [
  { value: "analysis", label: "Analisis", hint: "Se llama al terminar cada ingesta" },
  { value: "writing", label: "Redaccion", hint: "Para generar contenido (aun no automatizado)" },
  { value: "other", label: "Otra", hint: "Solo se dispara a mano" },
]

function kindLabel(kind: string): string {
  return KINDS.find((item) => item.value === kind)?.label ?? kind
}

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

function RoutineDialog({
  routine,
  trigger,
}: {
  routine?: RoutineView
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState(routine?.kind ?? "analysis")
  const { pending, error, run } = useAction()
  const editing = Boolean(routine)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form
          action={(formData) =>
            run(
              () => (editing ? updateRoutine(formData) : createRoutine(formData)),
              () => setOpen(false)
            )
          }
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Editar rutina" : "Nueva rutina"}</DialogTitle>
            <DialogDescription>
              Una rutina de Claude que se invoca por webhook, como si fuera una API.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {editing ? <input type="hidden" name="id" value={routine!.id} /> : null}
            <input type="hidden" name="kind" value={kind} />

            <div className="grid gap-1.5">
              <Label>Nombre</Label>
              <Input name="name" defaultValue={routine?.name} required />
            </div>

            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(value) => setKind(String(value))}>
                <SelectTrigger>
                  <SelectValue>{() => kindLabel(kind)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {KINDS.find((item) => item.value === kind)?.hint}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label>Webhook</Label>
              <Input
                name="webhook_url"
                type="url"
                placeholder="https://…"
                defaultValue={routine?.webhook_url ?? ""}
              />
              <p className="text-muted-foreground text-xs">
                Debe ser https: el token viaja en la peticion. Puedes dejarlo vacio y
                guardar la rutina como borrador hasta que tengas las claves.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label>Token</Label>
              <Input
                name="token"
                type="password"
                autoComplete="off"
                placeholder={editing ? "Dejar vacio para no cambiarlo" : ""}
              />
              <p className="text-muted-foreground text-xs">
                Se manda como <code>Authorization: Bearer</code> y como{" "}
                <code>X-Routine-Token</code>.
                {editing ? " Escribe “-” para borrarlo." : ""}
              </p>
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

function RoutineCard({ routine }: { routine: RoutineView }) {
  const { pending, error, run } = useAction()
  const [tested, setTested] = React.useState<string | null>(null)

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-4 py-4">
        <Switch
          checked={routine.is_active}
          disabled={pending}
          onCheckedChange={(checked) => run(() => toggleRoutine(routine.id, Boolean(checked)))}
          aria-label={`Activar ${routine.name}`}
          className="mt-1"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`font-semibold ${routine.is_active ? "" : "text-muted-foreground"}`}
            >
              {routine.name}
            </h3>
            <Badge variant="secondary">{kindLabel(routine.kind)}</Badge>
            {routine.webhook_url ? null : (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                borrador
              </Badge>
            )}
            {routine.hasToken ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                token {routine.tokenHint}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                sin token
              </Badge>
            )}
          </div>

          {routine.webhook_url ? (
            <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
              {routine.webhook_url}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Falta la URL del webhook. Editala para poder activarla.
            </p>
          )}

          <p className="text-muted-foreground mt-1 text-xs">
            Ultima llamada: {formatDateTime(routine.last_called_at)}
            {routine.last_status ? ` · ${routine.last_status}` : ""}
          </p>

          {routine.last_error ? (
            <p className="text-destructive mt-1 text-xs">{routine.last_error}</p>
          ) : null}
          {error ? <p className="text-destructive mt-1 text-sm">{error}</p> : null}
          {tested ? <p className="mt-1 text-sm text-emerald-600">{tested}</p> : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !routine.webhook_url}
            onClick={() => {
              setTested(null)
              run(() => testRoutine(routine.id), () => setTested("El webhook respondio correctamente."))
            }}
          >
            <PlayIcon />
            Probar
          </Button>
          <RoutineDialog
            routine={routine}
            trigger={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Editar rutina">
                <PencilIcon />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-8"
            aria-label="Borrar rutina"
            disabled={pending}
            onClick={() => run(() => deleteRoutine(routine.id))}
          >
            <Trash2Icon />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function RoutinesEditor({ routines }: { routines: RoutineView[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Las rutinas de tipo <strong>Analisis</strong> se invocan solas al terminar cada
          ingesta, con los ids de las noticias recien traidas.
        </p>
        <RoutineDialog
          trigger={
            <Button size="sm">
              <PlusIcon />
              Nueva rutina
            </Button>
          }
        />
      </div>

      {routines.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No hay rutinas configuradas. Sin una rutina de analisis activa, la ingesta guarda
            las noticias como <code>pending_analysis</code> y ahi se quedan.
          </CardContent>
        </Card>
      ) : (
        routines.map((routine) => <RoutineCard key={routine.id} routine={routine} />)
      )}
    </div>
  )
}
