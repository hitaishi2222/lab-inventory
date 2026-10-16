import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useItems, useCategories, useUsage, useLogUsage } from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ExportButton } from '@/components/export-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function Usage() {
  const { data: categories } = useCategories()
  const { data: itemsData } = useItems({ limit: 200 })
  const { data: me } = useMe()
  const canExport = can(me, 'export:data')
  const [itemId, setItemId] = useState('')
  const [quantityUsed, setQuantityUsed] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filterItemId, setFilterItemId] = useState('all')

  const logUsage = useLogUsage()
  const { data: history } = useUsage({
    itemId: filterItemId === 'all' ? undefined : filterItemId,
  })

  const equipmentCategoryId = (categories || []).find((c) => c.name === 'Equipment')?.id
  const usable = (itemsData?.items || []).filter((i) => i.categoryId !== equipmentCategoryId)
  const itemLookup = new Map((itemsData?.items || []).map((i) => [i.id, i]))
  const selected = itemLookup.get(itemId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await logUsage.mutateAsync({ itemId, quantityUsed: Number(quantityUsed), notes: notes || undefined })
      setItemId('')
      setQuantityUsed('')
      setNotes('')
    } catch {
      setError('Failed to log usage.')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Log usage</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={itemId} onValueChange={setItemId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {usable.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.quantity} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <p className="text-xs text-muted-foreground">
                  In stock: {selected.quantity} {selected.unit}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Amount used{selected ? ` (${selected.unit})` : ''} *</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                step="any"
                value={quantityUsed}
                onChange={(e) => setQuantityUsed(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usage-notes">Notes</Label>
              <Textarea
                id="usage-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Experiment / project reference…"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={logUsage.isPending || !itemId || !quantityUsed}>
              {logUsage.isPending ? 'Logging…' : 'Log usage'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ExportButton endpoint="/api/export/usage" filename="usage_logs_export.csv" canExport={canExport} />
          <Select value={filterItemId} onValueChange={setFilterItemId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Filter by item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              {(itemsData?.items || []).map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!history || history.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage logged yet.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Used at</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.logs.map((l) => {
                  const item = itemLookup.get(l.itemId)
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {item ? (
                          <Link to={`/inventory/${item.id}`} className="hover:underline">
                            {item.name}
                          </Link>
                        ) : (
                          l.itemId
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.quantityUsed} {item?.unit || ''}
                      </TableCell>
                      <TableCell>{new Date(l.usedAt).toLocaleString()}</TableCell>
                      <TableCell>{l.notes || '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
