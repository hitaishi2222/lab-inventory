import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type Role =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'POSTDOC'
  | 'PHD'
  | 'PROJECT_RESEARCH_FELLOW'
  | 'OTHERS'

export const ROLES: Role[] = [
  'ADMIN',
  'SUPERVISOR',
  'POSTDOC',
  'PHD',
  'PROJECT_RESEARCH_FELLOW',
  'OTHERS',
]

export type Permission =
  | 'inventory:view'
  | 'inventory:create'
  | 'inventory:edit'
  | 'inventory:delete'
  | 'equipment:checkout'
  | 'equipment:return'
  | 'usage:log'
  | 'notifications:view'
  | 'audit:view'
  | 'users:manage'
  | 'categories:manage'
  | 'export:data'
  | 'permissions:manage'
  | 'settings:manage'
  | 'labs:manage'

export interface Me {
  id: string
  email: string
  name: string
  role: Role
  permissions: Permission[]
  softwareName: string
  dateFormat: string
  timeFormat: string
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/users/me'),
    staleTime: 60_000,
    retry: false,
  })
}

/** True if the user has at least one of the listed permissions. */
export function can(me: Me | undefined, ...permissions: Permission[]) {
  if (!me) return false
  return permissions.some((p) => me.permissions.includes(p))
}

/** True only if the user has ALL of the listed permissions. */
export function canAll(me: Me | undefined, ...permissions: Permission[]) {
  if (!me) return false
  return permissions.every((p) => me.permissions.includes(p))
}

export function canManage(role?: Role) {
  return role === 'ADMIN' || role === 'SUPERVISOR'
}

export function isAdmin(role?: Role) {
  return role === 'ADMIN'
}
