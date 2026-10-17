import { useMe } from './use-me'

export const DATE_FORMAT_OPTIONS = [
  'DD MMM YYYY',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
] as const

export type DateFormat = (typeof DATE_FORMAT_OPTIONS)[number]

export const TIME_FORMAT_OPTIONS = ['24-hour', '12-hour'] as const

export type TimeFormat = (typeof TIME_FORMAT_OPTIONS)[number]

export const DEFAULT_DATE_FORMAT: DateFormat = 'DD MMM YYYY'
export const DEFAULT_TIME_FORMAT: TimeFormat = '24-hour'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Parse ISO / SQLite-datetime strings safely. Returns null when invalid. */
function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  const d = input instanceof Date ? input : new Date(input.includes('T') || input.includes('Z') ? input : input.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDatePart(d: Date, dateFormat: string): string {
  const day = pad(d.getDate())
  const month = pad(d.getMonth() + 1)
  const year = d.getFullYear()
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`
    case 'DD MMM YYYY':
    default:
      return `${day} ${MONTHS[d.getMonth()]} ${year}`
  }
}

function formatTimePart(d: Date, timeFormat: string): string {
  const h = d.getHours()
  if (timeFormat === '12-hour') {
    const suffix = h < 12 ? 'AM' : 'PM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${pad(d.getMinutes())} ${suffix}`
  }
  return `${pad(h)}:${pad(d.getMinutes())}`
}

/** Date only, in the lab's configured format. Falls back to raw input when unparseable. */
export function formatDateOnly(input: string | Date | null | undefined, dateFormat?: string): string {
  const d = toDate(input)
  if (!d) return typeof input === 'string' ? input : '—'
  return formatDatePart(d, dateFormat && (DATE_FORMAT_OPTIONS as readonly string[]).includes(dateFormat) ? dateFormat : DEFAULT_DATE_FORMAT)
}

/** Date + time in the lab's configured formats. */
export function formatDateTime(input: string | Date | null | undefined, dateFormat?: string, timeFormat?: string): string {
  const d = toDate(input)
  if (!d) return typeof input === 'string' ? input : '—'
  const tf = timeFormat === '12-hour' ? '12-hour' : DEFAULT_TIME_FORMAT
  return `${formatDateOnly(d, dateFormat)} ${formatTimePart(d, tf)}`
}

/** Example rendering of each format for the settings preview (uses today). */
export function formatExample(dateFormat: string, timeFormat: string): string {
  return formatDateTime(new Date(), dateFormat, timeFormat)
}

/**
 * Date/time formatters bound to the lab-wide settings from `/api/users/me`.
 * Safe for users without settings:manage — /me is readable by everyone.
 */
export function useDateTime() {
  const { data: me } = useMe()
  const dateFormat = me?.dateFormat ?? DEFAULT_DATE_FORMAT
  const timeFormat = me?.timeFormat ?? DEFAULT_TIME_FORMAT
  return {
    dateFormat,
    timeFormat,
    formatDate: (input: string | Date | null | undefined) => formatDateOnly(input, dateFormat),
    formatDateTime: (input: string | Date | null | undefined) => formatDateTime(input, dateFormat, timeFormat),
  }
}
