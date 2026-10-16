import { Navigate } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'
import { useMe, canAll, type Permission } from '@/lib/use-me'

export function RequireAuth({
  children,
  permissions,
}: {
  children: React.ReactNode
  permissions?: Permission[]
}) {
  const { data: session, isPending: sessionPending } = useSession()
  const me = useMe()

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-sm">
        <p className="text-muted-foreground">Could not load your profile. Try signing in again.</p>
        <a href="/login" className="underline">Back to login</a>
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
