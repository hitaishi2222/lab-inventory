// Thin fetch wrapper. Same-origin + cookies (better-auth uses httpOnly cookies),
// so no token handling is needed. Throws ApiError on non-2xx.

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body !== null && 'error' in body ? String((body as { error: unknown }).error) : `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
  // Multi-lab: carry the login-page lab selection so the request lands in
  // the right lab database. Absent in single-lab mode (no-op server-side).
  try {
    const labId = localStorage.getItem('selectedLabId')
    if (labId && !headers['x-lab-id']) headers['x-lab-id'] = labId
  } catch {
    /* storage unavailable — server falls back to the default lab */
  }
  // Only send Content-Type when there is a body: a JSON content type on
  // bodyless GETs forces a needless CORS preflight in dev.
  if (init?.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(path, { credentials: 'include', ...init, headers })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : undefined
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}
