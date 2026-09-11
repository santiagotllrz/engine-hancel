"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, BuildingIcon } from "lucide-react"

import { cambiarCuenta } from "@/app/cuenta/actions"
import type { Cuenta } from "@/engine/accounts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/**
 * Cambia de cuenta.
 *
 * Va arriba del todo, encima de la navegacion, porque de la cuenta depende
 * literalmente todo lo que hay debajo: las noticias, la taxonomia, el contenido
 * y las redes donde se publica. Ponerlo al lado del usuario, abajo, lo haria
 * parecer un ajuste de perfil, que es justo lo que no es.
 *
 * Con una sola cuenta no se dibuja el desplegable: un selector de un elemento
 * solo añade un clic que no lleva a ningun sitio.
 */
export function AccountSwitcher({
  cuentas,
  activa,
}: {
  cuentas: Cuenta[]
  activa: Cuenta
}) {
  const { isMobile } = useSidebar()
  const [cambiando, startTransition] = React.useTransition()

  const cabecera = (
    <>
      <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
        <BuildingIcon className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{activa.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {cambiando ? "cambiando…" : "cuenta"}
        </span>
      </div>
    </>
  )

  if (cuentas.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {cabecera}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            {cabecera}
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Cuentas
            </DropdownMenuLabel>

            {cuentas.map((cuenta) => (
              <DropdownMenuItem
                key={cuenta.id}
                disabled={cambiando}
                onClick={() => startTransition(async () => void (await cambiarCuenta(cuenta.slug)))}
              >
                <span className="flex-1 truncate">{cuenta.name}</span>
                {cuenta.id === activa.id ? <CheckIcon className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
