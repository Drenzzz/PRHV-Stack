"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
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
import { IconAlertTriangle, IconListDetails, IconSettings, IconInnerShadowTop, IconBroadcast, IconWorld } from "@tabler/icons-react"

const data = {
  navMain: [
    {
      title: "Monitors",
      url: "/dashboard",
      icon: (
        <IconListDetails />
      ),
    },
    {
      title: "Incidents",
      url: "/dashboard/incidents",
      icon: (
        <IconAlertTriangle />
      ),
    },
    {
      title: "Channels",
      url: "/dashboard/channels",
      icon: (
        <IconBroadcast />
      ),
    },
    {
      title: "Status Pages",
      url: "/dashboard/status-pages",
      icon: (
        <IconWorld />
      ),
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: (
        <IconSettings />
      ),
    },
  ],
}
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" aria-label="Home" />}
            >
              <IconInnerShadowTop className="size-5!" />
              <span className="text-base font-semibold">Lunite</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
