import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '@/lib/api'
import { type Role } from '@/lib/use-me'

// --- Types (mirror src/server/db/schema.ts) --------------------------------

export interface Category {
  id: string
  name: string
  description: string | null
  createdAt: string
}

export interface ChemicalDetails {
  id: string
  itemId: string
  casNumber: string | null
  hazardClass: string | null
  hazardPictograms: string | null
  expiryDate: string | null
  storageConditions: string | null
  sdsUrl: string | null
  molecularFormula: string | null
}

export interface EquipmentDetails {
  id: string
  itemId: string
  serialNumber: string | null
  status: 'AVAILABLE' | 'CHECKED_OUT' | 'MAINTENANCE'
  condition: string | null
  purchaseDate: string | null
  warrantyExpiry: string | null
}

export interface Item {
  id: string
  name: string
  categoryId: string | null
  description: string | null
  location: string | null
  quantity: number
  unit: string
  minStockThreshold: number
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  chemical?: ChemicalDetails | null
  equipment?: EquipmentDetails | null
}

export interface Checkout {
  id: string
  itemId: string
  userId: string
  checkedOutAt: string
  expectedReturnAt: string | null
  returnedAt: string | null
  notes: string | null
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE'
}

export interface UsageLog {
  id: string
  itemId: string
  userId: string
  quantityUsed: number
  usedAt: string
  notes: string | null
  createdAt: string
}

export interface Notification {
  id: string
  userId: string | null
  type: 'LOW_STOCK' | 'EXPIRY_WARNING' | 'OVERDUE_EQUIPMENT'
  title: string
  message: string
  read: number
  link: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  details: string | null
  ipAddress: string | null
  timestamp: string
}

export interface AppUser {
  id: string
  name: string
  email: string
  username: string | null
  role: Role
  createdAt: string
}

// --- Categories ---------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/api/categories').then((r) => r.categories),
  })
}

function useInvalidateCategories() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['categories'] })
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (id: string) => api(`/api/categories/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

// --- Items ---------------------------------------------------------------------

export function useItems(params: { search?: string; page?: number; limit?: number } = {}) {
  const { search = '', page = 1, limit = 50 } = params
  return useQuery({
    queryKey: ['items', search, page, limit],
    queryFn: () =>
      api<{ items: Item[]; total: number; page: number; limit: number }>(
        `/api/items${qs({ search, page, limit })}`,
      ),
  })
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => api<Item>(`/api/items/${id}`),
    enabled: !!id,
  })
}

function useInvalidateItems() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['items'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useCreateItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string }>('/api/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  })
}

export function useUpdateItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  })
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: (id: string) => api(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useRestock() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: ({ id, quantity, notes }: { id: string; quantity: number; notes?: string }) =>
      api<{ newQuantity: number }>(`/api/items/${id}/restock`, {
        method: 'POST',
        body: JSON.stringify({ quantity, notes }),
      }),
    onSuccess: invalidate,
  })
}

// --- Equipment ------------------------------------------------------------------

export function useCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedReturnAt, notes }: { id: string; expectedReturnAt: string; notes?: string }) =>
      api(`/api/equipment/${id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ expectedReturnAt, notes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['checkouts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/equipment/${id}/return`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['checkouts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useEquipmentHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['checkouts', id],
    queryFn: () => api<{ history: Checkout[] }>(`/api/equipment/${id}/history`).then((r) => r.history),
    enabled: !!id,
  })
}

// --- Usage -----------------------------------------------------------------------

export function useUsage(params: { itemId?: string; page?: number; limit?: number } = {}) {
  const { itemId, page = 1, limit = 50 } = params
  return useQuery({
    queryKey: ['usage', itemId, page, limit],
    queryFn: () =>
      api<{ logs: UsageLog[]; total: number }>(`/api/usage${qs({ itemId, page, limit })}`),
  })
}

export function useLogUsage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { itemId: string; quantityUsed: number; notes?: string }) =>
      api<{ newQuantity: number }>('/api/usage', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usage'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// --- Notifications -----------------------------------------------------------------

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: Notification[] }>('/api/notifications').then((r) => r.notifications),
    staleTime: 30_000,
  })
}

function useInvalidateNotifications() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notifications-unread'] })
  }
}

export function useMarkRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'PUT' }),
    onSuccess: invalidate,
  })
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'PUT' }),
    onSuccess: invalidate,
  })
}

// --- Audit --------------------------------------------------------------------------

export function useAudit(page = 1, limit = 50) {
  return useQuery({
    queryKey: ['audit', page, limit],
    queryFn: () => api<{ logs: AuditLog[]; total: number }>(`/api/audit${qs({ page, limit })}`),
  })
}

// --- Users (admin) --------------------------------------------------------------------

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: AppUser[] }>('/api/users').then((r) => r.users),
  })
}

function useInvalidateUsers() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['users'] })
}

export function useUpdateRole() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AppUser['role'] }) =>
      api(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (id: string) => api(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (body: {
      name: string
      email: string
      password: string
      username?: string
      role: AppUser['role']
    }) =>
      api('/api/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  })
}

// --- Dashboard summary ---------------------------------------------------------

export interface DashboardSummary {
  totalItems: number
  lowStock: {
    count: number
    items: { id: string; name: string; quantity: number; unit: string; minStockThreshold: number }[]
  }
  checkedOut: { count: number; items: { id: string; name: string }[] }
  expiringSoon: { count: number; items: { id: string; name: string; expiryDate: string | null }[] }
}

/** Counts + short preview lists, computed in SQL (no full-inventory download). */
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api<DashboardSummary>('/api/dashboard/summary'),
    staleTime: 30_000,
  })
}

// --- Dashboard activity charts -------------------------------------------------

export type ActivityRange = '7d' | '30d' | '90d' | '12m'

export interface ActivitySeries {
  itemId: string
  name: string
  value: number
}

export interface ActivityStats {
  range: ActivityRange
  buckets: { key: string; label: string }[]
  usage: { total: number; top: ActivitySeries[]; columns: number[][] }
  checkouts: { total: number; top: ActivitySeries[]; columns: number[][] }
}

export function useActivity(range: ActivityRange) {
  return useQuery({
    queryKey: ['dashboard', 'activity', range],
    queryFn: () => api<ActivityStats>(`/api/dashboard/activity?range=${range}`),
    staleTime: 60_000,
  })
}

// --- Reservations (equipment scheduling) ------------------------------------------

export interface Reservation {
  id: string
  itemId?: string
  itemName?: string
  userId: string
  userName: string
  startsAt: string
  endsAt: string
  notes: string | null
}

export function useReservations(itemId: string | undefined) {
  return useQuery({
    queryKey: ['reservations', itemId],
    queryFn: () =>
      api<{ reservations: Reservation[] }>(`/api/equipment/${itemId}/reservations`).then((r) => r.reservations),
    enabled: !!itemId,
  })
}

export function useUpcomingReservations() {
  return useQuery({
    queryKey: ['reservations', 'upcoming'],
    queryFn: () =>
      api<{ reservations: Reservation[] }>('/api/equipment/reservations/upcoming').then((r) => r.reservations),
    staleTime: 30_000,
  })
}

export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, startsAt, endsAt, notes }: { id: string; startsAt: string; endsAt: string; notes?: string }) =>
      api<{ id: string }>(`/api/equipment/${id}/reservations`, {
        method: 'POST',
        body: JSON.stringify({ startsAt, endsAt, notes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
    },
  })
}

export function useCancelReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (resId: string) => api(`/api/equipment/reservations/${resId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
    },
  })
}

// --- Role permissions (admin) ----

export function useRolePermissions() {
  return useQuery({
    queryKey: ['role-permissions'],
    queryFn: () =>
      api<{ byRole: Record<string, string[]> }>('/api/role-permissions').then(
        (r) => r.byRole,
      ),
  })
}

export function useUpdateRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      role,
      permissions,
    }: {
      role: string
      permissions: string[]
    }) =>
      api(`/api/role-permissions/${role}`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role-permissions'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// --- Settings ----

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ settings: Record<string, string> }>('/api/settings').then((r) => r.settings),
  })
}

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
