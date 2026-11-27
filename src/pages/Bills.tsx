import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import {
  useBills,
  useBill,
  useCreateBill,
  useUpdateBill,
  useDeleteBill,
  useTickBill,
  useCategories,
  type Bill,
  type BillDetail,
  type BillPayload,
} from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { useDateTime } from '@/lib/date-format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// --- Add / edit form -------------------------------------------------------

interface LineDraft {
  description: string
  quantity: string
  amount: string
}

interface FormDraft {
  billNumber: string
  vendorName: string
  billDate: string
  amount: string
  notes: string
  lines: LineDraft[]
}

function emptyDraft(): FormDraft {
  return {
    billNumber: '',
    vendorName: '',
    billDate: new Date().toISOString().slice(0, 10),
    amount: '0',
    notes: '',
    lines: [{ description: '', quantity: '1', amount: '0' }],
  }
}

function draftFromBill(bill: BillDetail): FormDraft {
  return {
    billNumber: bill.billNumber,
    vendorName: bill.vendorName,
    billDate: bill.billDate,
    amount: String(bill.amount),
    notes: bill.notes ?? '',
    lines: bill.items.length
      ? bill.items.map((l) => ({
          description: l.description,
          quantity: String(l.quantity),
          amount: String(l.amount),
        }))
      : [{ description: '', quantity: '1', amount: '0' }],
  }
}

function BillFormDialog({
  open,
  editing,
  onOpenChange,
}: {
  open: boolean
  editing: BillDetail | null
  onOpenChange: (open: boolean) => void
}) {
  const createBill = useCreateBill()
  const updateBill = useUpdateBill()
  const [draft, setDraft] = useState<FormDraft>(() => (editing ? draftFromBill(editing) : emptyDraft()))
  const [error, setError] = useState<string | null>(null)
  const busy = createBill.isPending || updateBill.isPending

  const set = (key: keyof Omit<FormDraft, 'lines'>, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))
  const setLine = (index: number, key: keyof LineDraft, value: string) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload: BillPayload = {
      billNumber: draft.billNumber.trim(),
      vendorName: draft.vendorName.trim(),
      billDate: draft.billDate,
      amount: Number(draft.amount) || 0,
      notes: draft.notes.trim() || undefined,
      items: draft.lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity) || 0,
          amount: Number(l.amount) || 0,
        })),
    }
    try {
      if (editing) await updateBill.mutateAsync({ id: editing.id, ...payload })
      else await createBill.mutateAsync(payload)
      onOpenChange(false)
    } catch {
      setError('Failed to save bill.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit bill' : 'Add bill'}</DialogTitle>
          <DialogDescription>
            Bill lines are what the vendor printed. Linking inventory items to the bill happens when
            you add or edit the item.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bill-number">Bill number *</Label>
              <Input
                id="bill-number"
                value={draft.billNumber}
                onChange={(e) => set('billNumber', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-vendor">Vendor *</Label>
              <Input
                id="bill-vendor"
                value={draft.vendorName}
                onChange={(e) => set('vendorName', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-date">Bill date *</Label>
              <Input
                id="bill-date"
                type="date"
                value={draft.billDate}
                onChange={(e) => set('billDate', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
                type="number"
                min={0}
                step="0.01"
                value={draft.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bill-notes">Details</Label>
            <Textarea
              id="bill-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Anything worth remembering about this purchase…"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <Label>Items on the bill</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  setDraft((d) => ({ ...d, lines: [...d.lines, { description: '', quantity: '1', amount: '0' }] }))
                }
              >
                <Plus className="mr-1 size-4" />
                Add line
              </Button>
            </div>
            {draft.lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Line ${i + 1} description`}
                  placeholder="Item / description"
                  value={line.description}
                  onChange={(e) => setLine(i, 'description', e.target.value)}
                />
                <Input
                  aria-label={`Line ${i + 1} quantity`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-24"
                  value={line.quantity}
                  onChange={(e) => setLine(i, 'quantity', e.target.value)}
                />
                <Input
                  aria-label={`Line ${i + 1} amount`}
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-28"
                  value={line.amount}
                  onChange={(e) => setLine(i, 'amount', e.target.value)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={draft.lines.length === 1}
                  onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, idx) => idx !== i) }))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !draft.billNumber.trim() || !draft.vendorName.trim() || !draft.billDate}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add bill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Detail view -----------------------------------------------------------

function Tick({
  label,
  checked,
  byName,
  at,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  byName: string | null
  at: string | null
  disabled: boolean
  onChange: (ticked: boolean) => void
}) {
  const { formatDateTime } = useDateTime()
  return (
    <label className="flex items-start gap-2 rounded-md border p-3">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">
          {checked
            ? `${byName ?? 'Unknown user'}${at ? ` · ${formatDateTime(at)}` : ''}`
            : 'Not ticked yet'}
        </span>
      </span>
    </label>
  )
}

function BillDialog({
  id,
  onClose,
  onEdit,
}: {
  id: string | null
  onClose: () => void
  onEdit: (bill: BillDetail) => void
}) {
  const { data: bill, isPending } = useBill(id)
  const { data: me } = useMe()
  const { data: categories } = useCategories()
  const tickBill = useTickBill()
  const deleteBill = useDeleteBill()
  const { formatDate } = useDateTime()
  const manage = can(me, 'bills:manage')
  const lookup = new Map((categories || []).map((c) => [c.id, c.name]))

  async function remove() {
    if (!bill) return
    await deleteBill.mutateAsync(bill.id)
    onClose()
  }

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {isPending || !bill ? (
          <p className="text-sm text-muted-foreground">Loading bill…</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {bill.vendorName} <span className="text-muted-foreground">· bill {bill.billNumber}</span>
              </DialogTitle>
              <DialogDescription>Bill dated {formatDate(bill.billDate)}</DialogDescription>
            </DialogHeader>

            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">Amount</dt>
                <dd className="text-sm font-medium">{money(bill.amount)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">Lines total</dt>
                <dd className="text-sm">{money(bill.items.reduce((sum, l) => sum + l.amount, 0))}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">Added</dt>
                <dd className="text-sm">{formatDate(bill.createdAt)}</dd>
              </div>
            </dl>

            {bill.notes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Details</p>
                <p className="whitespace-pre-wrap text-sm">{bill.notes}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Tick
                label="Received from vendor"
                checked={!!bill.receivedFromVendorAt}
                byName={bill.receivedFromVendorByName}
                at={bill.receivedFromVendorAt}
                disabled={!manage || tickBill.isPending}
                onChange={(ticked) =>
                  tickBill.mutate({ id: bill.id, checkpoint: 'RECEIVED', ticked })
                }
              />
              <Tick
                label="Submitted to university"
                checked={!!bill.submittedToUniversityAt}
                byName={bill.submittedToUniversityByName}
                at={bill.submittedToUniversityAt}
                disabled={!manage || tickBill.isPending}
                onChange={(ticked) =>
                  tickBill.mutate({ id: bill.id, checkpoint: 'SUBMITTED', ticked })
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Items on the bill</p>
              {bill.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lines recorded.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.items.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.description}</TableCell>
                          <TableCell className="text-right">{l.quantity}</TableCell>
                          <TableCell className="text-right">{money(l.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Inventory items from this bill</p>
              {bill.inventoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet — pick this bill while adding a chemical or consumable.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.inventoryItems.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>
                            <Link to={`/inventory/${i.id}`} className="text-primary hover:underline">
                              {i.name}
                            </Link>
                          </TableCell>
                          <TableCell>{(i.categoryId && lookup.get(i.categoryId)) || '—'}</TableCell>
                          <TableCell className="text-right">{`${i.quantity} ${i.unit}`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {manage && (
              <DialogFooter className="gap-2 sm:justify-between">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The bill and its lines are removed. Inventory items that point at it are kept
                        and simply lose the link.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" variant="outline" onClick={() => onEdit(bill)}>
                  Edit
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Page ------------------------------------------------------------------

export default function Bills() {
  const { data: bills, isPending, isError } = useBills()
  const { data: me } = useMe()
  const { formatDate } = useDateTime()
  const manage = can(me, 'bills:manage')

  const [search, setSearch] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<BillDetail | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const rows: Bill[] = (bills || []).filter((b) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      b.billNumber.toLowerCase().includes(q) ||
      b.vendorName.toLowerCase().includes(q) ||
      (b.notes ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search bills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          {manage && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="mr-2 size-4" />
              Add bill
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading bills…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load bills.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bills yet. Add one, then link items to it while adding stock.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Bill ID</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => {
                const unticked = !b.receivedFromVendorAt || !b.submittedToUniversityAt
                return (
                  <TableRow key={b.id}>
                    <TableCell>{formatDate(b.billDate)}</TableCell>
                    <TableCell className="font-medium">
                      {b.billNumber}
                      {unticked && (
                        <Badge variant="outline" className="ml-2">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{b.vendorName}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setViewId(b.id)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <BillDialog
        id={viewId}
        onClose={() => setViewId(null)}
        onEdit={(bill) => {
          setViewId(null)
          setEditing(bill)
          setFormOpen(true)
        }}
      />

      {formOpen && (
        <BillFormDialog
          open={formOpen}
          editing={editing}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
        />
      )}
    </div>
  )
}
