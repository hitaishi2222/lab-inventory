import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BarChart3Icon } from 'lucide-react'
import { useActivity, type ActivityRange } from '@/hooks/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const RANGES: { value: ActivityRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '12m', label: '12M' },
]

// Series keys are positional: s0..s2 = top-3 items, rest = everything else.
const SERIES_KEYS = ['s0', 's1', 's2', 'rest'] as const
const SERIES_COLORS = ['#3b82f6', '#e879f9', '#2dd4bf', '#a3e635']
const OTHERS_COLOR = '#6b7280'

function ChartCard({
  title,
  total,
  unit,
  buckets,
  top,
  columns,
  isPending,
}: {
  title: string
  total: number
  unit: string
  buckets: { key: string; label: string }[]
  top: { name: string; value: number }[]
  columns: number[][]
  isPending: boolean
}) {
  const config = useMemo<ChartConfig>(() => {
    const entries: ChartConfig = {}
    top.forEach((t, j) => {
      entries[SERIES_KEYS[j]!] = { label: t.name, color: SERIES_COLORS[j] }
    })
    entries.rest = { label: 'Others', color: OTHERS_COLOR }
    return entries
  }, [top])

  const rows = useMemo(
    () =>
      buckets.map((b, i) => {
        const cells = columns[i] ?? []
        return {
          label: b.label,
          s0: cells[0] ?? 0,
          s1: cells[1] ?? 0,
          s2: cells[2] ?? 0,
          rest: cells[3] ?? 0,
        }
      }),
    [buckets, columns],
  )

  const legend = useMemo(() => {
    const accounted = top.reduce((s, t) => s + t.value, 0)
    return [
      ...top.map((t, j) => ({ name: t.name, value: t.value, color: SERIES_COLORS[j]! })),
      { name: 'Others', value: total - accounted, color: OTHERS_COLOR },
    ]
  }, [top, total])

  const tickInterval = Math.max(0, Math.ceil(buckets.length / 8) - 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-2xl font-semibold tabular-nums">
          {isPending ? <Skeleton className="h-8 w-20" /> : total.toLocaleString()}
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : total === 0 ? (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No {unit} in this period.
          </p>
        ) : (
          <>
            <ChartContainer config={config} className="h-40 w-full">
              <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={tickInterval}
                  tick={{ fontSize: 10 }}
                />
                <YAxis hide allowDecimals={false} />
                <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltipContent />} />
                {SERIES_KEYS.map((key) => (
                  <Bar key={key} dataKey={key} stackId="total" fill={`var(--color-${key})`} />
                ))}
              </BarChart>
            </ChartContainer>
            <ul className="mt-3 space-y-1.5">
              {legend.map((row) => (
                <li key={row.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-muted-foreground">{row.name}</span>
                  <span className="ml-auto tabular-nums">{row.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function ActivityCharts() {
  const [range, setRange] = useState<ActivityRange>('30d')
  const { data, isPending, isError } = useActivity(range)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <BarChart3Icon className="size-4 text-muted-foreground" />
          Activity
        </h2>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v as ActivityRange)}
          variant="outline"
          size="sm"
          aria-label="Time period"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value} aria-label={`Last ${r.label}`}>
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">Failed to load activity charts.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Usage logged"
            total={data?.usage.total ?? 0}
            unit="usage logs"
            buckets={data?.buckets ?? []}
            top={data?.usage.top ?? []}
            columns={data?.usage.columns ?? []}
            isPending={isPending}
          />
          <ChartCard
            title="Equipment checkouts"
            total={data?.checkouts.total ?? 0}
            unit="checkouts"
            buckets={data?.buckets ?? []}
            top={data?.checkouts.top ?? []}
            columns={data?.checkouts.columns ?? []}
            isPending={isPending}
          />
        </div>
      )}
    </div>
  )
}
