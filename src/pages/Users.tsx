import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  useUsers,
  useUpdateRole,
  useDeleteUser,
  useCreateUser,
  type AppUser,
} from '@/hooks/queries'
import { ROLES, can, type Role } from '@/lib/use-me'
import { useMe } from '@/lib/use-me'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ExportButton } from '@/components/export-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  POSTDOC: 'PostDoc',
  PHD: 'PhD',
  PROJECT_RESEARCH_FELLOW: 'Project Research Fellow',
  OTHERS: 'Others',
}

export default function Users() {
  const { data, isPending, isError } = useUsers()
  const { data: me } = useMe()
  const canManageUsers = can(me, 'users:manage')
  const canExport = can(me, 'export:data')
  const updateRole = useUpdateRole()
  const deleteUser = useDeleteUser()
  const createUser = useCreateUser()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('OTHERS')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createUser.mutateAsync({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
      })
      setCreateOpen(false)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('OTHERS')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.')
    }
  }

  if (!canManageUsers) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium">Forbidden</p>
        <p className="text-sm text-muted-foreground">
          You need the users:manage permission to view this page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Users</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Create User
          </Button>
        </div>
        <ExportButton endpoint="/api/export/users" filename="users_export.csv" canExport={canExport} />
      </div>
      <p className="text-sm text-muted-foreground">
        Create lab member accounts and assign their role. Role determines what
        they can do in the system.
      </p>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load users.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data || []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {u.id === me?.id ? (
                      <Badge>{u.role} (you)</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(role) =>
                          updateRole.mutate({ id: u.id, role: role as AppUser['role'] })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== me?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={deleteUser.isPending}
                          >
                            {deleteUser.isPending ? 'Removing…' : 'Remove'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {u.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Their app profile will be deleted. Their auth account
                              stays but they won't be able to use the app.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUser.mutate(u.id)}
                              disabled={deleteUser.isPending}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Assign a role — it determines what the user can access.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-user-name">Full name *</Label>
              <Input
                id="create-user-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-email">Email *</Label>
              <Input
                id="create-user-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-password">Password *</Label>
              <Input
                id="create-user-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-role">Role *</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as Role)}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createUser.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
