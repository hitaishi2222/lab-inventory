import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function Categories() {
  const { data, isPending } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setError(null)
    setOpen(true)
  }

  function openEdit(id: string, currentName: string, currentDescription: string | null) {
    setEditingId(id)
    setName(currentName)
    setDescription(currentDescription || '')
    setError(null)
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editingId) {
        await updateCategory.mutateAsync({ id: editingId, name, description })
      } else {
        await createCategory.mutateAsync({ name, description: description || undefined })
      }
      setOpen(false)
    } catch {
      setError('Failed to save category.')
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center">
        <p className="text-sm text-muted-foreground">
          Items reference categories — deleting one leaves its items uncategorized.
        </p>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Add category
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data || []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.description || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c.id, c.name, c.description)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteCategory.mutate(c.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit category' : 'Add category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name *</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
