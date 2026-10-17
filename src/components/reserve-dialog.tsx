import { useState } from 'react'
import { useCreateReservation } from '@/hooks/queries'
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

/** datetime-local value (local time) for "now", for the min attribute. */
function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function ReserveDialog({
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
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reserve = useCreateReservation()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!startsAt || !endsAt) {
      setError('Pick a start and end time.')
      return
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError('The booking must end after it starts.')
      return
    }
    try {
      await reserve.mutateAsync({
        id: itemId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        notes: notes || undefined,
      })
      setStartsAt('')
      setEndsAt('')
      setNotes('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? String((err.body as { error?: unknown })?.error ?? err.message) : 'Booking failed — it may overlap another reservation.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserve equipment</DialogTitle>
          <DialogDescription>
            {itemName} — labmates will see this slot as booked.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reserve-start">Starts at *</Label>
              <Input
                id="reserve-start"
                type="datetime-local"
                value={startsAt}
                min={nowLocal()}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reserve-end">Ends at *</Label>
              <Input
                id="reserve-end"
                type="datetime-local"
                value={endsAt}
                min={startsAt || nowLocal()}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reserve-notes">Notes</Label>
            <Textarea
              id="reserve-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Experiment, project, contact…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reserve.isPending || !startsAt || !endsAt}>
              {reserve.isPending ? 'Booking…' : 'Book slot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
