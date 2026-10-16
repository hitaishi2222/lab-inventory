import { useState } from 'react'
import type { Category, Item } from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const UNITS = ['pieces', 'boxes', 'bottles', 'vials', 'g', 'mg', 'kg', 'mL', 'L']
const EQUIPMENT_STATUSES = ['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE']

export interface ItemFormValues {
  name: string
  categoryId: string
  description: string
  location: string
  quantity: number
  unit: string
  minStockThreshold: number
  chemical: Record<string, string>
  equipment: Record<string, string>
}

export function emptyValues(): ItemFormValues {
  return {
    name: '',
    categoryId: '',
    description: '',
    location: '',
    quantity: 0,
    unit: 'pieces',
    minStockThreshold: 0,
    chemical: { casNumber: '', hazardClass: '', expiryDate: '', storageConditions: '', sdsUrl: '', molecularFormula: '' },
    equipment: { serialNumber: '', condition: '', purchaseDate: '', status: 'AVAILABLE' },
  }
}

export function valuesFromItem(item: Item): ItemFormValues {
  const v = emptyValues()
  v.name = item.name
  v.categoryId = item.categoryId || ''
  v.description = item.description || ''
  v.location = item.location || ''
  v.quantity = item.quantity
  v.unit = item.unit
  v.minStockThreshold = item.minStockThreshold
  if (item.chemical) {
    for (const k of Object.keys(v.chemical)) {
      const val = (item.chemical as unknown as Record<string, string | null>)[k]
      if (val) v.chemical[k] = val
    }
  }
  if (item.equipment) {
    for (const k of Object.keys(v.equipment)) {
      const val = (item.equipment as unknown as Record<string, string | null>)[k]
      if (val) v.equipment[k] = val
    }
  }
  return v
}

function definedStrings(obj: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '') out[k] = v
  }
  return out
}

export function payloadFromValues(v: ItemFormValues, categoryName: string | undefined) {
  const payload: Record<string, unknown> = {
    name: v.name,
    categoryId: v.categoryId,
    description: v.description || undefined,
    location: v.location || undefined,
    quantity: Number(v.quantity),
    unit: v.unit,
    minStockThreshold: Number(v.minStockThreshold),
  }
  if (categoryName === 'Chemicals') payload.chemical = definedStrings(v.chemical)
  if (categoryName === 'Equipment') payload.equipment = definedStrings(v.equipment)
  return payload
}

export function ItemForm({
  categories,
  initial,
  busy,
  submitLabel,
  onSubmit,
}: {
  categories: Category[]
  initial: ItemFormValues
  busy: boolean
  submitLabel: string
  onSubmit: (v: ItemFormValues) => void
}) {
  const [v, setV] = useState<ItemFormValues>(initial)

  const set = (key: keyof ItemFormValues, value: string | number) =>
    setV((prev) => ({ ...prev, [key]: value }))
  const setDetail = (group: 'chemical' | 'equipment', key: string, value: string) =>
    setV((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }))

  const categoryName = categories.find((c) => c.id === v.categoryId)?.name

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(v)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" value={v.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={v.categoryId} onValueChange={(val) => set('categoryId', val)} required>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Storage location</Label>
          <Input id="location" value={v.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Bench A-1" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" value={v.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={0} step="any" value={v.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={v.unit} onValueChange={(val) => set('unit', val)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="threshold">Low-stock threshold</Label>
          <Input id="threshold" type="number" min={0} step="any" value={v.minStockThreshold} onChange={(e) => set('minStockThreshold', Number(e.target.value))} />
        </div>
      </div>

      {categoryName === 'Chemicals' && (
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Chemical safety details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CAS number</Label>
              <Input value={v.chemical.casNumber} onChange={(e) => setDetail('chemical', 'casNumber', e.target.value)} placeholder="e.g. 67-64-1" />
            </div>
            <div className="space-y-2">
              <Label>Molecular formula</Label>
              <Input value={v.chemical.molecularFormula} onChange={(e) => setDetail('chemical', 'molecularFormula', e.target.value)} placeholder="e.g. C3H6O" />
            </div>
            <div className="space-y-2">
              <Label>GHS hazard class</Label>
              <Input value={v.chemical.hazardClass} onChange={(e) => setDetail('chemical', 'hazardClass', e.target.value)} placeholder="e.g. Flammable Liquid Category 2" />
            </div>
            <div className="space-y-2">
              <Label>Expiry date</Label>
              <Input type="date" value={v.chemical.expiryDate} onChange={(e) => setDetail('chemical', 'expiryDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Storage conditions</Label>
              <Input value={v.chemical.storageConditions} onChange={(e) => setDetail('chemical', 'storageConditions', e.target.value)} placeholder="e.g. Flammable cabinet" />
            </div>
            <div className="space-y-2">
              <Label>SDS link</Label>
              <Input value={v.chemical.sdsUrl} onChange={(e) => setDetail('chemical', 'sdsUrl', e.target.value)} placeholder="https://…" />
            </div>
          </div>
        </fieldset>
      )}

      {categoryName === 'Equipment' && (
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Equipment details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Serial number</Label>
              <Input value={v.equipment.serialNumber} onChange={(e) => setDetail('equipment', 'serialNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Input value={v.equipment.condition} onChange={(e) => setDetail('equipment', 'condition', e.target.value)} placeholder="e.g. Good" />
            </div>
            <div className="space-y-2">
              <Label>Purchase date</Label>
              <Input type="date" value={v.equipment.purchaseDate} onChange={(e) => setDetail('equipment', 'purchaseDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={v.equipment.status} onValueChange={(val) => setDetail('equipment', 'status', val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>
      )}

      <Button type="submit" disabled={busy || !v.name || !v.categoryId}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
