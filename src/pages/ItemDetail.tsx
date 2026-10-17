import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  useItem,
  useCategories,
  useUpdateItem,
  useDeleteItem,
  useEquipmentHistory,
  useUsage,
  useReturn,
  useReservations,
} from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { useDateTime } from '@/lib/date-format'
import { ItemForm, valuesFromItem, payloadFromValues, type ItemFormValues } from '@/components/item-form'
import { CheckoutDialog } from '@/components/checkout-dialog'
import { RestockDialog } from '@/components/restock-dialog'
import { ReserveDialog } from '@/components/reserve-dialog'
import { ReservationList } from '@/components/reservation-list'
import { stockBadge, equipmentBadge, categoryNameOf } from '@/pages/Inventory'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  )
}

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: item, isPending, isError } = useItem(id)
  const { data: categories } = useCategories()
  const { data: me } = useMe()
  const { formatDate, formatDateTime } = useDateTime()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const returnEquipment = useReturn()
  const [editOpen, setEditOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const categoryName = item && categories
    ? categories.find((c) => c.id === item.categoryId)?.name
    : undefined
  const isEquipment = categoryName === 'Equipment'
  const history = useEquipmentHistory(isEquipment ? id : undefined)
  const reservations = useReservations(isEquipment ? id : undefined)
  const usage = useUsage(isEquipment ? undefined : { itemId: id })

  if (isPending) return <p className="text-sm text-muted-foreground">Loading item…</p>
  if (isError || !item) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Item not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/inventory">Back to inventory</Link>
        </Button>
      </div>
    )
  }

  const lookup = new Map((categories || []).map((c) => [c.id, c.name]))
  const editable = can(me, 'inventory:edit')
  const canDelete = can(me, 'inventory:delete')
  const canCheckout = can(me, 'equipment:checkout')
  const canReturn = can(me, 'equipment:return')
  const checkedOut = item.equipment?.status === 'CHECKED_OUT'
  const itemId = item.id

  async function submitEdit(v: ItemFormValues) {
    setFormError(null)
    try {
      await updateItem.mutateAsync({ id: itemId, ...payloadFromValues(v, categoryName) })
      setEditOpen(false)
    } catch {
      setFormError('Failed to save changes.')
    }
  }

  async function confirmDelete() {
    await deleteItem.mutateAsync(itemId)
    navigate('/inventory')
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{item.name}</h2>
        <div className="flex gap-1">
          {stockBadge(item)}
          {equipmentBadge(item)}
        </div>
        <div className="ml-auto flex gap-2">
          {isEquipment && !checkedOut && canCheckout && (
            <Button size="sm" onClick={() => setCheckoutOpen(true)}>Check out</Button>
          )}
          {isEquipment && checkedOut && canReturn && (
            <Button
              size="sm"
              variant="outline"
              disabled={returnEquipment.isPending}
              onClick={() => returnEquipment.mutate(item.id)}
            >
              {returnEquipment.isPending ? 'Returning…' : 'Return'}
            </Button>
          )}
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
          )}
          {editable && !isEquipment && (
            <Button size="sm" onClick={() => setRestockOpen(true)}>Add stock</Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {item.name} and its usage/checkout history will be permanently deleted.
                    This is logged in the audit trail.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" value={categoryNameOf(item, lookup)} />
            <Field label="Location" value={item.location} />
            <Field label="Quantity" value={`${item.quantity} ${item.unit}`} />
            <Field label="Low-stock threshold" value={`${item.minStockThreshold} ${item.unit}`} />
            <Field label="Description" value={item.description} />
            <Field label="Last updated" value={formatDateTime(item.updatedAt)} />
          </dl>
        </CardContent>
      </Card>

      {item.chemical && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chemical safety</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="CAS number" value={item.chemical.casNumber} />
              <Field label="Molecular formula" value={item.chemical.molecularFormula} />
              <Field label="GHS hazard class" value={item.chemical.hazardClass} />
              <Field label="Expiry date" value={item.chemical.expiryDate ? formatDate(item.chemical.expiryDate) : undefined} />
              <Field label="Storage conditions" value={item.chemical.storageConditions} />
              <Field
                label="SDS"
                value={
                  item.chemical.sdsUrl ? (
                    <a href={item.chemical.sdsUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Open Safety Data Sheet
                    </a>
                  ) : null
                }
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {item.equipment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Serial number" value={item.equipment.serialNumber} />
              <Field label="Condition" value={item.equipment.condition} />
              <Field label="Purchase date" value={item.equipment.purchaseDate} />
            </dl>
          </CardContent>
        </Card>
      )}

      {isEquipment ? (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checkout history</CardTitle>
          </CardHeader>
          <CardContent>
            {!history.data || history.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No checkouts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Checked out</TableHead>
                    <TableHead>Expected return</TableHead>
                    <TableHead>Returned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDateTime(h.checkedOutAt)}</TableCell>
                      <TableCell>{h.expectedReturnAt ? formatDate(h.expectedReturnAt) : '—'}</TableCell>
                      <TableCell>{h.returnedAt ? formatDateTime(h.returnedAt) : '—'}</TableCell>
                      <TableCell><Badge variant="outline">{h.status}</Badge></TableCell>
                      <TableCell>{h.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Upcoming bookings</CardTitle>
            {canCheckout && (
              <Button size="sm" variant="outline" onClick={() => setReserveOpen(true)}>
                Reserve
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ReservationList reservations={reservations.data} />
          </CardContent>
        </Card>
        <ReserveDialog itemId={itemId} itemName={item.name} open={reserveOpen} onOpenChange={setReserveOpen} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage history</CardTitle>
          </CardHeader>
          <CardContent>
            {!usage.data || usage.data.logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Used at</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.data.logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{formatDateTime(l.usedAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantityUsed} {item.unit}</TableCell>
                      <TableCell>{l.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          {categories && (
            <ItemForm
              categories={categories}
              initial={valuesFromItem(item)}
              busy={updateItem.isPending}
              submitLabel="Save changes"
              onSubmit={submitEdit}
            />
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </DialogContent>
      </Dialog>
      <CheckoutDialog itemId={item.id} itemName={item.name} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
      <RestockDialog itemId={item.id} itemName={item.name} quantity={item.quantity} unit={item.unit} open={restockOpen} onOpenChange={setRestockOpen} />
    </div>
  )
}
