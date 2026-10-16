import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '@/lib/auth-client'
import { useMe } from '@/lib/use-me'
import { useSettings, useUpdateSetting } from '@/hooks/queries'
import { can } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export default function Settings() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [softwareName, setSoftwareName] = useState(settings?.software_name || 'Labs')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const updateSetting = useUpdateSetting()
  const canManageSettings = can(me, 'settings:manage')

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword })
      if (res.error) throw new Error(res.error.message || 'Password change failed')
      setMessage('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setBusy(false)
    }
  }

  async function updateSoftwareName(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateSetting.mutateAsync({ key: 'software_name', value: softwareName })
    } catch {
      // Error handled by react-query / UI
    }
  }

  async function logout() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Name: </span>{me?.name}</p>
          <p><span className="text-muted-foreground">Email: </span>{me?.email}</p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Role: </span>
            <Badge>{me?.role}</Badge>
          </p>
        </CardContent>
      </Card>

      {canManageSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Software Name</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={updateSoftwareName} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="software_name">Lab / Software Name</Label>
                <Input
                  id="software_name"
                  value={softwareName}
                  onChange={(e) => setSoftwareName(e.target.value)}
                  required
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in the sidebar and header for all users.
                </p>
              </div>
              <Button type="submit" disabled={updateSetting.isPending}>
                {updateSetting.isPending ? 'Saving…' : 'Save Name'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-green-600">{message}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={logout}>Log out</Button>
    </div>
  )
}
