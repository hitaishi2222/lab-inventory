import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboardIcon,
  BoxesIcon,
  MicroscopeIcon,
  ClipboardListIcon,
  BellIcon,
  ScrollTextIcon,
  UsersIcon,
  TagsIcon,
  ShieldCheckIcon,
  SettingsIcon,
  FlaskConical,
} from 'lucide-react'
import { useMe, isAdmin } from '@/lib/use-me'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const mainNav = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboardIcon, end: true },
  { title: 'Inventory', url: '/inventory', icon: BoxesIcon },
  { title: 'Equipment', url: '/equipment', icon: MicroscopeIcon },
  { title: 'Usage Log', url: '/usage', icon: ClipboardListIcon },
  { title: 'Notifications', url: '/notifications', icon: BellIcon },
]

const adminNav = [
  { title: 'Audit Log', url: '/audit', icon: ScrollTextIcon },
  { title: 'Users', url: '/users', icon: UsersIcon },
  { title: 'Categories', url: '/categories', icon: TagsIcon },
  { title: 'Permissions', url: '/permissions', icon: ShieldCheckIcon },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: me } = useMe()
  const admin = isAdmin(me?.role)
  const location = useLocation()
  const active = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname === url || location.pathname.startsWith(`${url}/`)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <NavLink to="/">
                <span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <FlaskConical className="size-3.5" />
                </span>
                <span className="text-base font-semibold">{me?.softwareName || 'Labs'}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Lab</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={active(item.url, item.end)}>
                    <NavLink to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {admin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={active(item.url)}>
                      <NavLink to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Settings" isActive={active('/settings')}>
                  <NavLink to="/settings">
                    <SettingsIcon />
                    <span>Settings</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
