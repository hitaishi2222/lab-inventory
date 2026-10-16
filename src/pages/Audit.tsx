import { useState } from 'react'
import { useAudit } from '@/hooks/queries'
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

const PAGE_SIZE = 50

export default function Audit() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError } = useAudit(page, PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))
  const { data: me } = useMe()
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
                      {new Date(l.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.action}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.entityType} · <span className="font-mono text-xs">{l.entityId.slice(0, 8)}</span>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {l.details || '—'}
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
