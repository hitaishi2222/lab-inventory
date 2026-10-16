'use client'

import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportButton({
  endpoint,
  filename,
  label = 'Export CSV',
  canExport = true,
}: {
  endpoint: string
  filename: string
  label?: string
  canExport?: boolean
}) {
  const [busy, setBusy] = useState(false)

  if (!canExport) return null

  async function handleExport() {
    setBusy(true)
    try {
      const raw = await fetch(endpoint, { credentials: 'include' })
      if (!raw.ok) throw new Error('Export failed')
      const blob = await raw.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Error silently
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      disabled={busy}
    >
      {busy ? 'Exporting…' : (
        <>
          <DownloadIcon className="mr-2 size-4" />
          {label}
        </>
      )}
    </Button>
  )
}
