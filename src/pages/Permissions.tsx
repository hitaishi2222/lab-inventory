import { useState, useCallback } from 'react'
import { useRolePermissions, useUpdateRolePermissions } from '@/hooks/queries'
import { ROLES, type Permission } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PERMISSION_LABELS: Record<Permission, string> = {
  'inventory:view': 'View inventory',
  'inventory:create': 'Add items',
  'inventory:edit': 'Edit items',
  'inventory:delete': 'Delete items',
  'equipment:checkout': 'Check out equipment',
  'equipment:return': 'Return equipment',
  'usage:log': 'Log usage',
  'notifications:view': 'View notifications',
  'audit:view': 'View audit log',
  'users:manage': 'Manage users',
  'categories:manage': 'Manage categories',
  'export:data': 'Export data',
  'permissions:manage': 'Manage role permissions',
  'settings:manage': 'Manage settings',
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  POSTDOC: 'PostDoc',
  PHD: 'PhD',
  PROJECT_RESEARCH_FELLOW: 'Project Research Fellow',
  OTHERS: 'Others',
}

type Draft = Record<string, Set<Permission>>

export default function Permissions() {
  const { data: byRole, isPending } = useRolePermissions()
  const updateRolePermissions = useUpdateRolePermissions()

  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {}
    for (const role of ROLES) {
      d[role] = new Set((byRole?.[role] || []) as Permission[])
    }
    return d
  })

  const [saving, setSaving] = useState<Set<string>>(new Set())

  const toggle = useCallback(
    (role: string, perm: Permission) => {
      setDraft((prev) => {
        const next = { ...prev }
        const perms = new Set(next[role])
        if (perms.has(perm)) perms.delete(perm)
        else perms.add(perm)
        next[role] = perms
        return next
      })
    },
    [],
  )

  async function saveRole(role: string) {
    setSaving((prev) => new Set([...prev, role]))
    try {
      await updateRolePermissions.mutateAsync({
        role,
        permissions: Array.from(draft[role]),
      })
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(role)
        return next
      })
    }
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading permissions…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Role Permissions</h2>
        <p className="text-sm text-muted-foreground ml-auto">
          Admin controls what each role can do. Changes apply immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permissions by role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  {Object.entries(PERMISSION_LABELS).map(([perm]) => (
                    <TableHead key={perm} className="text-center">
                      <Badge variant="outline" className="text-xs">
                        {perm.split(':')[0]}
                      </Badge>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLES.map((role) => {
                  const isAdminFixed = role === 'ADMIN'
                  const granted = draft[role]
                  return (
                    <TableRow key={role}>
                      <TableCell className="font-medium">
                        {ROLE_LABELS[role]}
                        {isAdminFixed && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (full access)
                          </span>
                        )}
                      </TableCell>
                      {Object.keys(PERMISSION_LABELS).map((perm) => {
                        const p = perm as Permission
                        const checked = isAdminFixed || granted.has(p)
                        return (
                          <TableCell key={perm} className="text-center">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={
                                isAdminFixed ? undefined : () => toggle(role, p)
                              }
                              data-role={role}
                              value={p}
                              disabled={isAdminFixed}
                            />
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={isAdminFixed || saving.has(role)}
                          onClick={() => saveRole(role)}
                        >
                          {saving.has(role) ? 'Saving…' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Admin always has full access. Checking a box grants that permission to
        the role; unchecking removes it.
      </p>
    </div>
  )
}
