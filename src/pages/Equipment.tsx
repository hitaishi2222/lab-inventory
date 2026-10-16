import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useItems, useCategories, useEquipmentHistory, useReturn, type Item } from '@/hooks/queries'
import { CheckoutDialog } from '@/components/checkout-dialog'
import { equipmentBadge } from '@/pages/Inventory'
import { useMe, can } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
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

function EquipmentRow({ item }: { item: Item }) {
  const { data: me } = useMe()
  const canCheckout = can(me, 'equipment:checkout')
  const canReturn = can(me, 'equipment:return')
  const checkedOut = item.equipment?.status === 'CHECKED_OUT'
  const history = useEquipmentHistory(checkedOut ? item.id : undefined)
  const returnEquipment = useReturn()
  const [checkoutOpen, setCheckoutOpen] = useState(false)

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
                {new Date(active.expectedReturnAt).toLocaleDateString()}
                {overdue && <Badge variant="destructive">Overdue</Badge>}
              </span>
            ) : (
              '—'
            )
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
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
        </TableCell>
      </TableRow>
      <CheckoutDialog itemId={item.id} itemName={item.name} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected return</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <EquipmentRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
