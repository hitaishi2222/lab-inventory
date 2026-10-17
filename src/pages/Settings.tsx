import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authClient, useSession } from '@/lib/auth-client'
import { api } from '@/lib/api'
import { useMe } from '@/lib/use-me'
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  formatExample,
  type DateFormat,
  type TimeFormat,
} from '@/lib/date-format'
import { useSettings, useUpdateSetting } from '@/hooks/queries'
import { can } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function Settings() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [softwareName, setSoftwareName] = useState(settings?.software_name || 'Labs')
  const [dateFormat, setDateFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(DEFAULT_TIME_FORMAT)
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null)

  // Sync selects once the admin-only settings query resolves.
  useEffect(() => {
    if (settings?.date_format && (DATE_FORMAT_OPTIONS as readonly string[]).includes(settings.date_format)) {
      setDateFormat(settings.date_format as DateFormat)
    }
    if (settings?.time_format && (TIME_FORMAT_OPTIONS as readonly string[]).includes(settings.time_format)) {
      setTimeFormat(settings.time_format as TimeFormat)
    }
  }, [settings])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileReady, setProfileReady] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  // Fill the form once the profile loads (but don't clobber edits).
  useEffect(() => {
    if (me && !profileReady) {
      setProfileName(me.name)
      setProfileEmail(me.email)
      setProfileReady(true)
    }
  }, [me, profileReady])

  const emailChanged =
    profileReady && profileEmail.trim().toLowerCase() !== (me?.email ?? '').toLowerCase()

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setProfileMessage(null)
    if (!me) return
    const payload: Record<string, string> = {}
    if (profileName.trim() && profileName.trim() !== me.name) {
      payload.name = profileName.trim()
    }
    if (emailChanged) {
      payload.email = profileEmail.trim()
      payload.currentPassword = profilePassword
    }
    if (Object.keys(payload).length === 0) {
      setProfileMessage('Nothing to save.')
      return
    }
    setProfileBusy(true)
    try {
      const res = await api<{ changed: string[] }>('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await refetchSession()
      setProfilePassword('')
      setProfileMessage(
        res.changed.includes('email')
          ? 'Saved. Sign in with your new email address from now on.'
          : 'Saved.'
      )
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setProfileBusy(false)
    }
  }
  const { data: session, refetch: refetchSession } = useSession()
  const currentUsername =
    (session?.user as { username?: string | null } | undefined)?.username ?? null
  const [username, setUsername] = useState('')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameBusy, setUsernameBusy] = useState(false)

  async function changeUsername(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameMessage(null)
    setUsernameBusy(true)
    try {
      const next = username.trim().toLowerCase()
      const res = await authClient.updateUser({ username: next })
      if (res.error) throw new Error(res.error.message || 'Username change failed')
      await refetchSession()
      setUsernameMessage(
        `Username saved — you can now sign in with "${next}" as well as your email.`
      )
      setUsername('')
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Username change failed')
    } finally {
      setUsernameBusy(false)
    }
  }
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

  async function updateDateTimeFormat(e: React.FormEvent) {
    e.preventDefault()
    setPrefsMessage(null)
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'date_format', value: dateFormat }),
        updateSetting.mutateAsync({ key: 'time_format', value: timeFormat }),
      ])
      // useUpdateSetting invalidates ['me'], so every date display
      // across the app picks up the new format immediately.
      setPrefsMessage(`Saved. Dates now look like: ${formatExample(dateFormat, timeFormat)}`)
    } catch {
      // Error handled by react-query / UI
    }
  }

  async function logout() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  // Two columns on desktop so the page uses the available width, single
  // column on mobile. Cards stay top-aligned per column.
  return (
    <div className="mx-auto grid w-full max-w-5xl items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile_name">Name</Label>
              <Input
                id="profile_name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_email">Email</Label>
              <Input
                id="profile_email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                Used for sign-in, together with your
                {currentUsername ? <> username (<span className="font-medium text-foreground">{currentUsername}</span>)</> : ' username (not set yet — see below)'}.
              </p>
            </div>
            {emailChanged && (
              <div className="space-y-2">
                <Label htmlFor="profile_password">Current password</Label>
                <Input
                  id="profile_password"
                  type="password"
                  value={profilePassword}
                  onChange={(e) => setProfilePassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">
                  Required to change your email address.
                </p>
              </div>
            )}
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            {profileMessage && <p className="text-sm text-green-600">{profileMessage}</p>}
            <Button type="submit" disabled={profileBusy}>
              {profileBusy ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
          <p className="mt-4 flex items-center gap-2 text-sm">
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

      {canManageSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Date & time format</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={updateDateTimeFormat} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date_format">Date format</Label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                  <SelectTrigger id="date_format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time_format">Time format</Label>
                <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as TimeFormat)}>
                  <SelectTrigger id="time_format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24-hour">24-hour (14:30)</SelectItem>
                    <SelectItem value="12-hour">12-hour (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Preview: {formatExample(dateFormat, timeFormat)} · Applies to all users.
              </p>
              {prefsMessage && <p className="text-sm text-green-600">{prefsMessage}</p>}
              <Button type="submit" disabled={updateSetting.isPending}>
                {updateSetting.isPending ? 'Saving…' : 'Save format'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Username</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changeUsername} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={30}
                autoComplete="username"
                placeholder={currentUsername ?? 'e.g. marie_curie'}
              />
              <p className="text-xs text-muted-foreground">
                3–30 characters, letters, numbers, dots and underscores only.
                You can sign in with it instead of your email.
              </p>
            </div>
            {usernameError && <p className="text-sm text-destructive">{usernameError}</p>}
            {usernameMessage && <p className="text-sm text-green-600">{usernameMessage}</p>}
            <Button type="submit" disabled={usernameBusy}>
              {usernameBusy ? 'Saving…' : currentUsername ? 'Change username' : 'Set username'}
            </Button>
          </form>
        </CardContent>
      </Card>

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

      <div className="lg:col-span-2">
        <Button variant="outline" onClick={logout}>Log out</Button>
      </div>
    </div>
  )
}
