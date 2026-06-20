import { Button } from 'primereact/button'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { TypeAheadPicker } from '@/components/common/TypeAheadPicker'

import type { PlannerItemOption } from './production-planner-data'

interface Row {
  key: string
  option: PlannerItemOption | null
  qty: number | null
}

interface Props {
  options: PlannerItemOption[]
  /** Called with the aggregated itemId -> quantity map whenever rows change. */
  onInventoryChange: (inventory: Record<string, number>) => void
  /** Bump to reset the editor to a single empty row (e.g. on dialog open). */
  resetSignal: number
}

function toInventory(rows: Row[]): Record<string, number> {
  const inventory: Record<string, number> = {}
  for (const row of rows) {
    if (!row.option || row.qty == null || row.qty <= 0) continue
    inventory[row.option.id] = (inventory[row.option.id] ?? 0) + row.qty
  }
  return inventory
}

export function PlannerInventoryEditor({ options, onInventoryChange, resetSignal }: Props) {
  const { t } = useTranslation()
  const idRef = useRef(0)
  const newRow = (): Row => ({ key: `row-${idRef.current++}`, option: null, qty: null })
  const [rows, setRows] = useState<Row[]>(() => [newRow()])

  useEffect(() => {
    idRef.current = 0
    setRows([{ key: 'row-0', option: null, qty: null }])
    idRef.current = 1
  }, [resetSignal])

  useEffect(() => {
    onInventoryChange(toInventory(rows))
  }, [rows, onInventoryChange])

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      return next.length > 0 ? next : [newRow()]
    })
  }

  const addRow = () => setRows((prev) => [...prev, newRow()])

  return (
    <div className="flex flex-column gap-2">
      <label className="font-semibold">{t('settings.productionPlanner.inventoryLabel')}</label>
      {rows.map((row) => (
        <div key={row.key} className="flex align-items-center gap-2">
          <div className="flex-grow-1">
            <TypeAheadPicker
              placeholder={t('settings.productionPlanner.itemPlaceholder')}
              value={row.option}
              candidates={options}
              onChange={(option) => updateRow(row.key, { option })}
            />
          </div>
          <NumericField
            value={row.qty}
            onChange={(qty) => updateRow(row.key, { qty })}
            min={0}
            placeholder={t('settings.productionPlanner.quantityPlaceholder')}
            style={{ width: '6rem', textAlign: 'right' }}
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            severity="secondary"
            aria-label={t('settings.productionPlanner.removeItem')}
            onClick={() => removeRow(row.key)}
          />
        </div>
      ))}
      <div>
        <Button
          icon="pi pi-plus"
          text
          label={t('settings.productionPlanner.addItem')}
          onClick={addRow}
        />
      </div>
    </div>
  )
}
