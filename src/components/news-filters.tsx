"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { statusLabel } from "@/lib/format"
import { SearchIcon, XIcon } from "lucide-react"

const ALL = "__all__"

export function NewsFilters({
  niches,
  statuses,
}: {
  niches: { value: string; count: number }[]
  statuses: { value: string; count: number }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const niche = searchParams.get("niche") ?? ALL
  const status = searchParams.get("status") ?? ALL
  const q = searchParams.get("q") ?? ""

  const apply = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === ALL) next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, router, searchParams]
  )

  const hasFilters = niche !== ALL || status !== ALL || Boolean(q)

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get("q")
        apply({ q: typeof value === "string" ? value.trim() || null : null })
      }}
    >
      <div className="relative flex-1 sm:max-w-xs">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        {/* `key` remonta el input cuando la URL cambia por otra via (sidebar,
            boton limpiar), que es la forma que recomienda React para resetear
            estado derivado sin recurrir a un efecto. */}
        <Input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Buscar titulo, tema o fuente…"
          className="pl-8"
          aria-label="Buscar noticias"
        />
      </div>

      <Select value={niche} onValueChange={(value) => apply({ niche: value as string })}>
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por nicho">
          <SelectValue>
            {(value: string | null) =>
              !value || value === ALL ? "Todos los nichos" : value
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los nichos</SelectItem>
          {niches.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.value} ({item.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(value) => apply({ status: value as string })}>
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por estado">
          <SelectValue>
            {(value: string | null) =>
              !value || value === ALL ? "Todos los estados" : statusLabel(value)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          {statuses.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {statusLabel(item.value)} ({item.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="secondary">
        Buscar
      </Button>

      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          <XIcon />
          Limpiar
        </Button>
      ) : null}
    </form>
  )
}
