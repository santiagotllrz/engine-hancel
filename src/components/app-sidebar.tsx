"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { Cuenta } from "@/engine/accounts"
import { AccountSwitcher } from "@/components/account-switcher"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BotIcon, KanbanIcon, SettingsIcon } from "lucide-react"

import { AGENTES } from "@/lib/agentes-catalogo"

export function AppSidebar({
  email,
  cuentas,
  cuenta,
  ...props
}: {
  email: string
  cuentas: Cuenta[]
  cuenta: Cuenta
} & React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  const navMain = [
    {
      // Sin subsecciones: el estudio es una sola pantalla, el tablero, y
      // colgarle hijos que no existen solo añadiria un desplegable vacio.
      title: "Estudio",
      url: "/",
      icon: <KanbanIcon />,
      isActive: pathname === "/",
      items: [],
    },
    {
      title: "Agentes",
      url: `/agentes/${AGENTES[0].clave}`,
      icon: <BotIcon />,
      isActive: pathname.startsWith("/agentes"),
      // En el orden del pipeline, que es el recorrido de una noticia: quien
      // abre esto casi siempre viene siguiendo donde se atasco algo.
      items: AGENTES.map((a) => ({
        title: a.nombre,
        url: `/agentes/${a.clave}`,
        isActive: pathname === `/agentes/${a.clave}`,
      })),
    },
    {
      title: "Configuracion",
      url: "/configuracion/general",
      icon: <SettingsIcon />,
      isActive: pathname.startsWith("/configuracion"),
      items: [
        {
          title: "General",
          url: "/configuracion/general",
          isActive: pathname === "/configuracion/general",
        },
        {
          title: "Conexiones",
          url: "/configuracion/conexiones",
          isActive: pathname === "/configuracion/conexiones",
        },
        {
          title: "Marca",
          url: "/configuracion/marca",
          isActive: pathname === "/configuracion/marca",
        },
      ],
    },
  ]

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              {/* El lockup completo con la sidebar abierta; al colapsarla a
                  ancho de icono no cabe una marca apaisada, asi que se cambia
                  por el isotipo. Ambas llevan alt vacio y el nombre accesible
                  lo pone el span de abajo, para que no cambie con el estado. */}
              <Image
                src="/hancel-lockup.png"
                alt=""
                width={469}
                height={114}
                priority
                className="h-7 w-auto group-data-[collapsible=icon]:hidden"
              />
              <Image
                src="/hancel.png"
                alt=""
                width={180}
                height={180}
                className="hidden size-8 shrink-0 rounded-lg group-data-[collapsible=icon]:block"
              />
              <span className="sr-only">Hancel</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <AccountSwitcher cuentas={cuentas} activa={cuenta} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={email} />
      </SidebarFooter>
    </Sidebar>
  )
}
