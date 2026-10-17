import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useItems, useCategories, useEquipmentHistory, useReturn, useUpcomingReservations, useCancelReservation, type Item, type Reservation } from '@/hooks/queries'
import { CheckoutDialog } from '@/components/checkout-dialog'
import { ReserveDialog } from '@/components/reserve-dialog'
import { formatBookingRange } from '@/components/reservation-list'
import { equipmentBadge } from '@/pages/Inventory'
import { useMe, can } from '@/lib/use-me'
import { useDateTime } from '@/lib/date-format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExportButton } from '@/components/export-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function EquipmentRow({ item, nextBooking }: { item: Item; nextBooking?: Reservation }) {
  const { data: me } = useMe()
  const { formatDate, formatDateTime } = useDateTime()
  const canCheckout = can(me, 'equipment:checkout')
  const canReturn = can(me, 'equipment:return')
  const checkedOut = item.equipment?.status === 'CHECKED_OUT'
  const history = useEquipmentHistory(checkedOut ? item.id : undefined)
  const returnEquipment = useReturn()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)

  const active = (history.data || []).find((h) => h.status === 'ACTIVE')
  const overdue = active?.expectedReturnAt
    ? new Date(active.expectedReturnAt) < new Date(new Date().toDateString())
    : false

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <Link to={`/inventory/${item.id}`} className="hover:underline">
            {item.name}
          </Link>
        </TableCell>
        <TableCell>{item.location || '—'}</TableCell>
        <TableCell>{equipmentBadge(item)}</TableCell>
        <TableCell>
          {checkedOut ? (
            active?.expectedReturnAt ? (
              <span className="flex items-center gap-2">
                {formatDate(active.expectedReturnAt)}
                {overdue && <Badge variant="destructive">Overdue</Badge>}
              </span>
            ) : (
              '—'
            )
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          {nextBooking ? (
            <span className="text-xs tabular-nums" title={`${nextBooking.userName}${nextBooking.notes ? ` · ${nextBooking.notes}` : ''}`}>
              {formatBookingRange(nextBooking.startsAt, nextBooking.endsAt, formatDate, formatDateTime)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
          {checkedOut ? canReturn && (
            <Button
              size="sm"
              variant="outline"
              disabled={returnEquipment.isPending}
              onClick={() => returnEquipment.mutate(item.id)}
            >
              {returnEquipment.isPending ? 'Returning…' : 'Return'}
            </Button>
          ) : canCheckout && (
            <Button size="sm" onClick={() => setCheckoutOpen(true)}>Check out</Button>
          )}
          {canCheckout && (
            <Button size="sm" variant="outline" onClick={() => setReserveOpen(true)}>Reserve</Button>
          )}
          </div>
        </TableCell>
      </TableRow>
      <CheckoutDialog itemId={item.id} itemName={item.name} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
      <ReserveDialog itemId={item.id} itemName={item.name} open={reserveOpen} onOpenChange={setReserveOpen} />
    </>
  )
}

export default function Equipment() {
  const { data: categories } = useCategories()
  const { data, isPending, isError } = useItems({ limit: 200 })
  const { data: me } = useMe()
  const canExport = can(me, 'export:data')

  const equipmentCategoryId = (categories || []).find((c) => c.name === 'Equipment')?.id
  const equipment = (data?.items || []).filter((i) => i.categoryId === equipmentCategoryId)
  const upcoming = useUpcomingReservations()
  const cancelReservation = useCancelReservation()
  const { formatDateTime } = useDateTime()
  const canCancelAny = can(me, 'users:manage')
  const nextByItem = new Map<string, Reservation>()
  for (const r of upcoming.data || []) {
    if (!nextByItem.has(r.itemId!)) nextByItem.set(r.itemId!, r)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <ExportButton endpoint="/api/export/items" filename="equipment_export.csv" canExport={canExport} />
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading equipment…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load equipment.</p>
      ) : equipment.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No equipment yet. Add items under the Equipment category.
        </p>
      ) : (
        <>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected return</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <EquipmentRow key={item.id} item={item} nextBooking={nextByItem.get(item.id)} />
              ))}
            </TableBody>
          </Table>
        </div>

        {(upcoming.data?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Booked by</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(upcoming.data ?? []).map((r) => {
                    const own = me?.id === r.userId
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <Link to={`/inventory/${r.itemId}`} className="hover:underline">
                            {r.itemName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {r.userName}
                          {r.notes && (
                            <span className="block max-w-48 truncate text-xs text-muted-foreground" title={r.notes}>
                              {r.notes}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(r.startsAt)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(r.endsAt)}</TableCell>
                        <TableCell className="text-right">
                          {(own || canCancelAny) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={cancelReservation.isPending}
                              onClick={() => cancelReservation.mutate(r.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        </>
      )}
    </div>
  )
}
