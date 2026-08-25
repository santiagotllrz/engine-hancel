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
      title: "Pipeline",
      url: "/pipeline",
      icon: <ActivityIcon />,
      isActive: pathname === "/pipeline",
    },
  ]

  const navSecondary = [
    {
      title: "Supabase",
      url: "https://supabase.com/dashboard/project/xfsxcmhatdiaqrlhanwx",
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
              {/* El logo ya trae su propio fondo redondeado: va suelto, no
                  dentro de otro contenedor de color. */}
              <Image
                src="/hancel.png"
                alt=""
                width={32}
                height={32}
                priority
                className="size-8 shrink-0 rounded-lg"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Engine Hancel</span>
                <span className="truncate text-xs">Research Engine</span>
              </div>
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
            email: "xfsxcmhatdiaqrlhanwx",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
