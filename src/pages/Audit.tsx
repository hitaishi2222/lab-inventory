import { useState } from 'react'
import { useAudit } from '@/hooks/queries'
import { useMe, can } from '@/lib/use-me'
import { useDateTime } from '@/lib/date-format'
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

const PAGE_SIZE = 50

const DETAIL_LABELS: Record<string, string> = {
  email: 'Email',
  name: 'Name',
  role: 'Role',
  status: 'Status',
  notes: 'Notes',
  itemId: 'Item',
  itemName: 'Item',
  quantityUsed: 'Qty used',
  expectedReturnAt: 'Expected return',
  createdBy: 'Created by',
}

function prettyKey(key: string) {
  return (
    DETAIL_LABELS[key] ??
    key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  )
}

function prettyValue(value: unknown) {
  if (typeof value !== 'string') return String(value)
  // UUIDs (item ids) are unreadable in full — shorten, full value on hover.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return `${value.slice(0, 8)}…`
  }
  return value
}

/** Turn the stored JSON details blob into readable key/value rows. */
function parseDetails(details: string | null): { key: string; value: string; full: string }[] | null {
  if (!details) return null
  try {
    const obj = JSON.parse(details) as unknown
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return [{ key: '', value: details, full: details }]
    }
    const entries = Object.entries(obj as Record<string, unknown>)
    if (entries.length === 0) return null
    return entries.map(([k, v]) => ({
      key: prettyKey(k),
      value: prettyValue(v),
      full: typeof v === 'string' ? v : JSON.stringify(v),
    }))
  } catch {
    return [{ key: '', value: details, full: details }]
  }
}

export default function Audit() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError } = useAudit(page, PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))
  const { data: me } = useMe()
  const { formatDateTime } = useDateTime()
  const canExport = can(me, 'export:data')

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <ExportButton endpoint="/api/export/audit" filename="audit_log_export.csv" canExport={canExport} />
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading audit log…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load audit log.</p>
      ) : !data || data.logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries yet.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(l.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.action}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.entityType} · <span className="font-mono text-xs">{l.entityId.slice(0, 8)}</span>
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {(() => {
                        const rows = parseDetails(l.details)
                        if (!rows) return '—'
                        return (
                          <div className="space-y-0.5">
                            {rows.map((r, i) => (
                              <div key={i} className="text-xs leading-relaxed break-words">
                                {r.key && <span className="font-medium text-foreground">{r.key}: </span>}
                                <span title={r.full}>{r.value}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <span>Page {page} of {totalPages} ({data.total} entries)</span>
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
