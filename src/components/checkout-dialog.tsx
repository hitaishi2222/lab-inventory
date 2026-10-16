import { useState } from 'react'
import { useCheckout } from '@/hooks/queries'
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

export function CheckoutDialog({
  itemId,
  itemName,
  open,
  onOpenChange,
}: {
  itemId: string
  itemName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expectedReturnAt, setExpectedReturnAt] = useState('')
  const [notes, setNotes] = useState('')
  const checkout = useCheckout()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await checkout.mutateAsync({ id: itemId, expectedReturnAt, notes: notes || undefined })
      setExpectedReturnAt('')
      setNotes('')
      onOpenChange(false)
    } catch {
      // error shown inline
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out equipment</DialogTitle>
          <DialogDescription>{itemName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expected-return">Expected return date *</Label>
            <Input
              id="expected-return"
              type="date"
              value={expectedReturnAt}
              onChange={(e) => setExpectedReturnAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checkout-notes">Notes</Label>
            <Textarea
              id="checkout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Project, experiment, contact…"
            />
          </div>
          {checkout.isError && (
            <p className="text-sm text-destructive">Check-out failed. It may already be checked out.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={checkout.isPending || !expectedReturnAt}>
              {checkout.isPending ? 'Checking out…' : 'Check out'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
