import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BellIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteHeader({ title }: { title: string }) {
  const { data } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api<{ notifications: { read: number }[] }>('/api/notifications'),
    select: (d) => d.notifications.filter((n) => !n.read).length,
    staleTime: 30_000,
  })

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link to="/notifications" aria-label="Notifications">
              <BellIcon className="size-4" />
              {data ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                  {data > 9 ? '9+' : data}
                </span>
              ) : null}
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
