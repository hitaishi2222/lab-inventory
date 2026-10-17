import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { authClient, useSession } from '@/lib/auth-client'
import { useLabs } from '@/lib/labs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // NOTE: every hook must run before any early return — otherwise React
  // throws "rendered fewer hooks than expected" exactly when the session
  // arrives (i.e. right after login), breaking the redirect.
  const { labs, selected, select, multiLab } = useLabs()

  if (!isPending && session?.user) {
    return <Navigate to="/" replace />
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Usernames can't contain '@' (letters/numbers/dots/underscores only),
      // so anything with '@' is an email, everything else a username.
      const id = identifier.trim()
      const res = id.includes('@')
        ? await authClient.signIn.email({ email: id, password })
        : await authClient.signIn.username({ username: id, password })
      if (res.error) throw new Error(res.error.message || 'Sign-in failed')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="size-4" />
            </span>
            <span className="text-base font-semibold">Labs</span>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Sign in to manage lab inventory. Don't have an account? Ask your lab administrator to create one for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email or username</Label>
              <Input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@lab.edu or your_username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : 'Sign in'}
            </Button>
            <div className="flex justify-center mt-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot password?
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {/* Lab selector: only rendered when the server is configured with
          more than one lab (two separate labs in one instance). In
          single-lab mode this stays completely hidden. */}
      {multiLab && (
        <div className="flex w-full max-w-sm items-center justify-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="lab-select">Lab:</label>
          <select
            id="lab-select"
            value={selected}
            onChange={(e) => {
              select(e.target.value)
              // Drop any cached profile/session from the previous lab so
              // the UI re-checks auth against the newly selected lab.
              queryClient.invalidateQueries({ queryKey: ['me'] })
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          >
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
