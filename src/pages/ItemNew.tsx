import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategories, useCreateItem } from '@/hooks/queries'
import { ItemForm, emptyValues, payloadFromValues, type ItemFormValues } from '@/components/item-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ItemNew() {
  const { data: categories } = useCategories()
  const createItem = useCreateItem()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function submit(v: ItemFormValues) {
    setError(null)
    const categoryName = (categories || []).find((c) => c.id === v.categoryId)?.name
    try {
      const res = await createItem.mutateAsync(payloadFromValues(v, categoryName))
      navigate(`/inventory/${res.id}`)
    } catch {
      setError('Failed to create item.')
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Add item</CardTitle>
      </CardHeader>
      <CardContent>
        {!categories ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ItemForm
              categories={categories}
              initial={emptyValues()}
              busy={createItem.isPending}
              submitLabel="Create item"
              onSubmit={submit}
            />
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
