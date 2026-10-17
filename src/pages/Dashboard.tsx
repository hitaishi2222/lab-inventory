import { Link } from 'react-router-dom'
import { BoxesIcon, TriangleAlertIcon, MicroscopeIcon, FlaskConicalIcon } from 'lucide-react'
import { useItems } from '@/hooks/queries'
import { useDateTime } from '@/lib/date-format'
import { ActivityCharts } from '@/components/activity-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { data, isPending, isError } = useItems({ limit: 500 })
  const { formatDate } = useDateTime()

  if (isPending) return <p className="text-sm text-muted-foreground">Loading dashboard…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load dashboard.</p>

  const items = data.items

  const lowStock = items.filter((i) => !i.equipment && i.quantity <= i.minStockThreshold)
  const checkedOut = items.filter((i) => i.equipment?.status === 'CHECKED_OUT')
  const now = new Date()
  const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const expiring = items.filter((i) => {
    if (!i.chemical?.expiryDate) return false
    const exp = new Date(i.chemical.expiryDate)
    return exp >= now && exp <= soon
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BoxesIcon} label="Total items" value={items.length} />
        <StatCard
          icon={TriangleAlertIcon}
          label="Low stock"
          value={lowStock.length}
          hint={lowStock.length ? 'Needs restocking' : 'All stocked'}
        />
        <StatCard
          icon={MicroscopeIcon}
          label="Equipment checked out"
          value={checkedOut.length}
        />
        <StatCard
          icon={FlaskConicalIcon}
          label="Expiring within 60 days"
          value={expiring.length}
          hint={expiring.length ? 'Check chemical safety' : 'Nothing expiring soon'}
        />
      </div>

      <ActivityCharts />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Low stock alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everything is above threshold.</p>
            ) : (
              <ul className="space-y-2">
                {lowStock.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <Link to={`/inventory/${i.id}`} className="font-medium hover:underline">
                      {i.name}
                    </Link>
                    <Badge variant="destructive" className="ml-auto tabular-nums">
                      {i.quantity} {i.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment out right now</CardTitle>
          </CardHeader>
          <CardContent>
            {checkedOut.length === 0 ? (
              <p className="text-sm text-muted-foreground">All equipment is available.</p>
            ) : (
              <ul className="space-y-2">
                {checkedOut.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <Link to={`/inventory/${i.id}`} className="font-medium hover:underline">
                      {i.name}
                    </Link>
                    <Badge className="ml-auto">Checked out</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {expiring.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chemicals expiring soon</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {expiring.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <Link to={`/inventory/${i.id}`} className="font-medium hover:underline">
                    {i.name}
                  </Link>
                  <span className="ml-auto text-muted-foreground">
                    Expires {i.chemical?.expiryDate ? formatDate(i.chemical.expiryDate) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
