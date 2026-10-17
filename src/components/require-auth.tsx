import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authClient, useSession } from '@/lib/auth-client'
import { useMe, canAll, type Permission } from '@/lib/use-me'

export function RequireAuth({
  children,
  permissions,
}: {
  children: React.ReactNode
  permissions?: Permission[]
}) {
  const { data: session, isPending: sessionPending } = useSession()
  const navigate = useNavigate()
  const me = useMe()

  const profileFailed = !sessionPending && !me.isPending && (me.isError || !me.data)

  useEffect(() => {
    if (profileFailed) {
      // Session cookie exists but the app profile is gone (e.g. account
      // deleted) or unreachable: clear the stale cookie and bounce to
      // /login instead of hanging on a "Signing out…" screen.
      authClient.signOut().finally(() => navigate('/login', { replace: true }))
    }
  }, [profileFailed, navigate])

  if (sessionPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />
  }

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm">
        <p className="text-muted-foreground">Could not load your profile. Redirecting to sign in…</p>
      </div>
    )
  }

  if (permissions && !canAll(me.data, ...permissions)) {
    const missing = permissions.filter((p) => !me.data.permissions.includes(p))
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium">Forbidden</p>
        <p className="text-sm text-muted-foreground">
          You need the {missing.join(', ')} permission{'s'}{missing.length > 1 ? 's' : ''} to view this page.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
