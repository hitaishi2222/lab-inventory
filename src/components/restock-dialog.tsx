import { useState } from 'react'
import { useRestock } from '@/hooks/queries'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function RestockDialog({
  itemId,
  itemName,
  quantity,
  unit,
  open,
  onOpenChange,
}: {
  itemId: string
  itemName: string
  quantity: number
  unit: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const restock = useRestock()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = Number(amount)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    try {
      await restock.mutateAsync({ id: itemId, quantity: qty, notes: notes || undefined })
      setAmount('')
      setNotes('')
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? String((err.body as { error?: unknown })?.error ?? err.message)
          : 'Failed to add stock.',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>
            {itemName} — currently {quantity} {unit}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="restock-amount">Amount received ({unit}) *</Label>
            <Input
              id="restock-amount"
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restock-notes">Notes</Label>
            <Textarea
              id="restock-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Supplier, batch / lot number…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={restock.isPending || !amount}>
              {restock.isPending ? 'Adding…' : 'Add stock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
