import { Link } from 'react-router-dom'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: 'Low stock',
  EXPIRY_WARNING: 'Expiring soon',
  OVERDUE_EQUIPMENT: 'Overdue',
}

export default function Notifications() {
  const { data, isPending, isError } = useNotifications()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const unread = (data || []).filter((n) => !n.read).length

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {unread ? `${unread} unread` : 'All caught up'}
        </p>
        {unread > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load notifications.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        data.map((n) => (
          <Card key={n.id} className={n.read ? 'opacity-70' : undefined}>
            <CardContent className="flex items-start gap-3 pt-4">
              <Badge variant={n.read ? 'outline' : 'default'}>{TYPE_LABEL[n.type] || n.type}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString()}
                  {n.link && (
                    <>
                      {' · '}
                      <Link to={n.link} className="text-primary hover:underline">
                        View item
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read && (
                <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                  Mark read
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
