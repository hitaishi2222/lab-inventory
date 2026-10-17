import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useLabs, getSelectedLabId, type LabOption } from '@/lib/labs'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function Labs() {
  const { labs, selected, select, refresh } = useLabs()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<LabOption | null>(null)

  // The lab this browser tab is currently pointed at (defaults to the first).
  const currentId = selected || getSelectedLabId() || labs[0]?.id || ''

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCreated(null)
    setBusy(true)
    try {
      const res = await api<{ lab: LabOption }>('/api/labs', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      setCreated(res.lab)
      setName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create lab.')
    } finally {
      setBusy(false)
    }
  }

  function switchTo(lab: LabOption) {
    // Point this tab at the new lab and go to the login page: the old
    // lab's session is not valid there, so you sign in again with the
    // same password (your account was copied over automatically).
    select(lab.id)
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" />
            Labs
          </CardTitle>
          <CardDescription>
            Each lab is a fully separate database — own users, inventory and
            history. You are signed in to the one marked current.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labs.map((lab) => (
                <TableRow key={lab.id}>
                  <TableCell className="font-medium">{lab.name}</TableCell>
                  <TableCell className="text-right">
                    {lab.id === currentId ? (
                      <Badge>current</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => switchTo(lab)}>
                        Switch
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New lab</CardTitle>
          <CardDescription>
            Creates a fresh, empty lab next to the current one. Your Admin
            account is copied over, so you sign in with the same password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lab-name">Lab name</Label>
              <Input
                id="lab-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder="e.g. Quantum Lab"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create lab'}
            </Button>
          </form>
          {created && (
            <div className="mt-4 space-y-2 rounded-md border p-3 text-sm">
              <p className="text-green-600">Lab “{created.name}” created.</p>
              <Button type="button" size="sm" onClick={() => switchTo(created)}>
                Switch to {created.name}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
