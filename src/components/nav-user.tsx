"use client"

import * as React from "react"
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react"

import { cerrarSesion } from "@/app/login/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/**
 * La cuenta con la que se entro, y la salida.
 *
 * El menu tenia antes entradas de plantilla —Upgrade, Billing, Notifications—
 * que no llevaban a ningun sitio. Con una sesion real detras, dejarlas seria
 * enseñar cuatro botones rotos alrededor del unico que hace algo.
 */
export function NavUser({ email }: { email: string }) {
  const { isMobile } = useSidebar()
  const [saliendo, startTransition] = React.useTransition()

  // La inicial del correo: no hay nombre ni foto que mostrar, y dos letras
  // inventadas se leerian como si los hubiera.
  const inicial = email.trim().charAt(0).toUpperCase() || "?"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar>
              <AvatarFallback>{inicial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Hancel</span>
              <span className="truncate text-xs">{email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarFallback>{inicial}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Hancel</span>
                    <span className="truncate text-xs">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              disabled={saliendo}
              onClick={() => startTransition(async () => void (await cerrarSesion()))}
            >
              <LogOutIcon />
              {saliendo ? "Saliendo…" : "Cerrar sesion"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
