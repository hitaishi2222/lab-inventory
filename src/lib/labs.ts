import { useEffect, useState } from 'react'

export interface LabOption {
  id: string
  name: string
}

const STORAGE_KEY = 'selectedLabId'

/** Currently selected lab (localStorage). Empty means "server default". */
export function getSelectedLabId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setSelectedLabId(id: string) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable — header simply won't be sent */
  }
  // Mirror into a plain cookie so better-auth requests (which can't set
  // custom headers) are routed to the same lab server-side.
  try {
    document.cookie = `lab_id=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

/** Extra headers carrying the lab selection for API calls. */
export function labHeaders(): Record<string, string> {
  const id = getSelectedLabId()
  return id ? { 'x-lab-id': id } : {}
}

/** Fetch the public lab list. Returns a single default entry when the server has one lab. */
export async function fetchLabs(): Promise<LabOption[]> {
  const res = await fetch('/api/labs', { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as { labs?: LabOption[] }
  return Array.isArray(data.labs) ? data.labs : []
}

/** React hook: lab list + selection. `labs.length > 1` means show the selector. */
export function useLabs() {
  const [labs, setLabs] = useState<LabOption[]>([])
  const [selected, setSelected] = useState<string>(() => getSelectedLabId())

  useEffect(() => {
    let cancelled = false
    fetchLabs()
      .then((list) => {
        if (cancelled) return
        setLabs(list)
        // Default the selection to the first lab so the header is explicit.
        if (list.length > 1) {
          const current = getSelectedLabId()
          if (!current || !list.some((l) => l.id === current)) {
            setSelectedLabId(list[0].id)
            setSelected(list[0].id)
          }
        }
      })
      .catch(() => {
        /* offline / server not ready — selector stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [])

  function select(id: string) {
    setSelectedLabId(id)
    setSelected(id)
  }

  async function refresh() {
    try {
      const list = await fetchLabs()
      setLabs(list)
    } catch {
      /* keep the previous list on failure */
    }
  }

  return { labs, selected, select, refresh, multiLab: labs.length > 1 }
}
