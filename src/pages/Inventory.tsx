import { useState, useDeferredValue } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useItems, useCategories, type Item } from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

export function categoryNameOf(item: Item, lookup: Map<string, string>) {
  return (item.categoryId && lookup.get(item.categoryId)) || '—'
}

export function stockBadge(item: Item) {
  // Equipment is tracked by availability (Available / Checked out), never by
  // stock level — a quantity/threshold badge is meaningless for it.
  if (item.equipment) return null
  if (item.quantity <= 0) return <Badge variant="destructive">Out of stock</Badge>
  if (item.quantity <= item.minStockThreshold) return <Badge variant="destructive">Low stock</Badge>
  return <Badge variant="secondary">In stock</Badge>
}

export function equipmentBadge(item: Item) {
  const status = item.equipment?.status
  if (!status) return null
  if (status === 'AVAILABLE') return <Badge variant="secondary">Available</Badge>
  if (status === 'CHECKED_OUT') return <Badge>Checked out</Badge>
  return <Badge variant="outline">Maintenance</Badge>
}

const PAGE_SIZE = 20

export default function Inventory() {
  const [searchInput, setSearchInput] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const search = useDeferredValue(searchInput)

  const { data: categories } = useCategories()
  const { data, isPending, isError } = useItems({ search, page, limit: PAGE_SIZE })
  const { data: me } = useMe()
  const canExport = can(me, 'export:data')

  const lookup = new Map((categories || []).map((c) => [c.id, c.name]))
  const items = (data?.items || []).filter((i) => categoryId === 'all' || i.categoryId === categoryId)
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search items…"
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
          className="max-w-xs"
        />
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1) }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories || []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ExportButton endpoint="/api/export/items" filename="items_export.csv" canExport={canExport} />
        <div className="ml-auto">
          {can(me, 'inventory:create') && (
            <Button size="sm" asChild>
              <Link to="/inventory/new">
                <Plus className="mr-2 size-4" />
                Add item
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading inventory…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load inventory.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link to={`/inventory/${item.id}`} className="hover:underline">
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{categoryNameOf(item, lookup)}</TableCell>
                    <TableCell>{item.location || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {stockBadge(item)}
                        {equipmentBadge(item)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Page {page} of {totalPages} ({data?.total || 0} items)</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
