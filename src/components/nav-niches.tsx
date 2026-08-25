"use client"

import Link from "next/link"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { TagIcon } from "lucide-react"

export function NavNiches({
  niches,
  activeNiche,
}: {
  niches: { value: string; count: number }[]
  activeNiche?: string | null
}) {
  if (!niches.length) return null

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Nichos</SidebarGroupLabel>
      <SidebarMenu>
        {niches.map((niche) => (
          <SidebarMenuItem key={niche.value}>
            <SidebarMenuButton
              isActive={activeNiche === niche.value}
              render={
                <Link href={`/noticias?niche=${encodeURIComponent(niche.value)}`} />
              }
            >
              <TagIcon />
              <span>{niche.value}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{niche.count}</SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
