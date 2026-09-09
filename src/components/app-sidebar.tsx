"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavNiches } from "@/components/nav-niches"
import { NavSecondary } from "@/components/nav-secondary"
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
import {
  ActivityIcon,
  BookOpenIcon,
  CpuIcon,
  DatabaseIcon,
  NewspaperIcon,
  PenLineIcon,
} from "lucide-react"

export type NicheCount = { value: string; count: number }

export function AppSidebar({
  niches,
  ...props
}: { niches: NicheCount[] } & React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentNiche = searchParams.get("niche")
  const currentStatus = searchParams.get("status")

  const navMain = [
    {
      title: "Hancel Engine",
      url: "/engine",
      icon: <CpuIcon />,
      isActive: pathname.startsWith("/engine"),
      items: [
        { title: "En vivo", url: "/engine", isActive: pathname === "/engine" },
        { title: "Taxonomia", url: "/engine/config", isActive: pathname === "/engine/config" },
        { title: "Horario", url: "/engine/schedule", isActive: pathname === "/engine/schedule" },
        { title: "Rutinas", url: "/engine/routines", isActive: pathname === "/engine/routines" },
        { title: "Grafo", url: "/engine/graph", isActive: pathname === "/engine/graph" },
      ],
    },
    {
      title: "Noticias",
      url: "/noticias",
      icon: <NewspaperIcon />,
      isActive: pathname === "/noticias",
      items: [
        { title: "Todas", url: "/noticias", isActive: pathname === "/noticias" && !currentNiche && !currentStatus },
        { title: "Analizadas", url: "/noticias?status=analyzed", isActive: currentStatus === "analyzed" },
        { title: "Pendientes", url: "/noticias?status=pending_analysis", isActive: currentStatus === "pending_analysis" },
      ],
    },
    {
      title: "Contenido",
      url: "/contenido",
      icon: <PenLineIcon />,
      isActive: pathname.startsWith("/contenido"),
      items: [
        { title: "Estudio", url: "/contenido", isActive: pathname === "/contenido" },
        { title: "Variables", url: "/contenido/config", isActive: pathname === "/contenido/config" },
        { title: "Cola", url: "/contenido/cola", isActive: pathname === "/contenido/cola" },
      ],
    },
    {
      title: "Pipeline",
      url: "/pipeline",
      icon: <ActivityIcon />,
      isActive: pathname === "/pipeline",
    },
  ]

  const navSecondary = [
    {
      title: "Supabase",
      url: "https://supabase.com/dashboard/project/iddjepduokjysnibjjqy",
      icon: <DatabaseIcon />,
    },
    {
      title: "Documentacion",
      url: "https://supabase.com/docs",
      icon: <BookOpenIcon />,
    },
  ]

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/engine" />}>
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
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavNiches niches={niches} activeNiche={currentNiche} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: "Engine Hancel",
            email: "iddjepduokjysnibjjqy",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
