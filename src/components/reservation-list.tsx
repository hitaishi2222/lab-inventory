import { useCancelReservation, type Reservation } from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { useDateTime } from '@/lib/date-format'
import { Button } from '@/components/ui/button'

/** Compact range: same-day shows the date once, multi-day shows both ends. */
export function formatBookingRange(
  startsAt: string,
  endsAt: string,
  formatDate: (d: string) => string,
  formatDateTime: (d: string) => string,
): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const sameDay =
    !Number.isNaN(s.getTime()) &&
    !Number.isNaN(e.getTime()) &&
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate()
  if (sameDay) {
    const timeOf = (d: Date) =>
      formatDateTime(d.toISOString()).slice(formatDate(d.toISOString()).length).trim()
    return `${formatDate(s.toISOString())}, ${timeOf(s)} – ${timeOf(e)}`
  }
  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`
}

export function ReservationList({ reservations }: { reservations: Reservation[] | undefined }) {
  const { data: me } = useMe()
  const { formatDate, formatDateTime } = useDateTime()
  const cancel = useCancelReservation()
  const canCancelAny = can(me, 'users:manage')

  if (!reservations || reservations.length === 0) {
    return <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
  }

  return (
    <ul className="space-y-2">
      {reservations.map((r) => {
        const own = me?.id === r.userId
        return (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium tabular-nums">
                {formatBookingRange(r.startsAt, r.endsAt, formatDate, formatDateTime)}
              </p>
              <p className="truncate text-muted-foreground">
                {r.userName}
                {r.notes ? ` · ${r.notes}` : ''}
              </p>
            </div>
            {(own || canCancelAny) && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto shrink-0"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(r.id)}
              >
                Cancel
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
