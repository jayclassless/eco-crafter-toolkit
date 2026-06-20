import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { InputText } from 'primereact/inputtext'
import { ProgressBar } from 'primereact/progressbar'
import { Tag } from 'primereact/tag'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import {
  GroupedSinglePicker,
  type GroupedSinglePickerGroup,
} from '@/components/common/GroupedSinglePicker'
import { useCellValue } from '@/hooks/use-store-revision'
import {
  computeHarvestDate,
  computePickableDate,
  formatTimeUntil,
  harvestProgress,
  isRegrowCrop,
} from '@/lib/crop-growth'

import type { Crop } from './crop-tracker-types'

interface CropOption {
  id: string
  name: string
  rawName: string
}

interface Props {
  buildStore: Store
  plantingId: string
  crops: Crop[]
  cropsById: Map<string, Crop>
  growthRateModifier: number
  now: Date
  onRemove: (plantingId: string) => void
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function PlantingRow({
  buildStore,
  plantingId,
  crops,
  cropsById,
  growthRateModifier,
  now,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState<GroupedSinglePickerGroup<CropOption>[]>([])

  const cropItemId =
    useCellValue<string>(buildStore, 'userPlantings', plantingId, 'cropItemId') ?? ''
  const name = useCellValue<string>(buildStore, 'userPlantings', plantingId, 'name') ?? ''
  const plantedAt = useCellValue<string>(buildStore, 'userPlantings', plantingId, 'plantedAt') ?? ''
  const hasRegrown =
    useCellValue<boolean>(buildStore, 'userPlantings', plantingId, 'hasRegrown') ?? false

  const crop = cropItemId ? (cropsById.get(cropItemId) ?? null) : null
  const isPlanted = plantedAt !== ''

  const setCell = (field: string, value: string | boolean) =>
    buildStore.setCell('userPlantings', plantingId, field, value)

  const completeCrops = (event: { query: string }) => {
    const q = event.query.toLowerCase()
    const matched = crops.filter((c) => c.name.toLowerCase().includes(q))
    const toOption = (c: Crop) => ({ id: c.id, name: c.name, rawName: c.rawName })
    const groups: GroupedSinglePickerGroup<CropOption>[] = []
    const cropItems = matched.filter((c) => !c.isTree).map(toOption)
    const treeItems = matched.filter((c) => c.isTree).map(toOption)
    if (cropItems.length > 0) {
      groups.push({
        groupLabel: t('cropTracker.cropGroupLabel'),
        groupRawName: '',
        items: cropItems,
      })
    }
    if (treeItems.length > 0) {
      groups.push({
        groupLabel: t('cropTracker.treeGroupLabel'),
        groupRawName: '',
        items: treeItems,
      })
    }
    setSuggestions(groups)
  }

  const handleSelectCrop = (value: CropOption | null) => {
    setCell('cropItemId', value?.id ?? '')
    // Changing the crop invalidates any in-progress planting.
    setCell('plantedAt', '')
    setCell('hasRegrown', false)
  }

  const handlePlant = () => {
    setCell('plantedAt', new Date().toISOString())
    setCell('hasRegrown', false)
  }

  const handleHarvest = () => {
    if (crop && isRegrowCrop(crop)) {
      // Regen crops regrow from a fraction of maturity; replant on a shorter cycle.
      setCell('hasRegrown', true)
      setCell('plantedAt', new Date().toISOString())
    } else {
      setCell('plantedAt', '')
      setCell('hasRegrown', false)
    }
  }

  const harvestDate =
    crop && isPlanted ? computeHarvestDate(plantedAt, crop, growthRateModifier, hasRegrown) : null
  const pickableDate =
    crop && isPlanted ? computePickableDate(plantedAt, crop, growthRateModifier, hasRegrown) : null

  const plantedDate = isPlanted ? new Date(plantedAt) : null
  const progress = plantedDate && harvestDate ? harvestProgress(plantedDate, harvestDate, now) : 0

  const status: 'ready' | 'pickable' | 'growing' | null = !isPlanted
    ? null
    : harvestDate && now >= harvestDate
      ? 'ready'
      : pickableDate && now >= pickableDate
        ? 'pickable'
        : 'growing'

  const selectedOption: CropOption | null = crop
    ? { id: crop.id, name: crop.name, rawName: crop.rawName }
    : null

  return (
    <Card
      className="mb-2"
      pt={{ body: { className: 'p-3' }, content: { className: 'p-0 flex flex-column gap-2' } }}
    >
      <div className="flex align-items-center gap-2 flex-wrap">
        <InputText
          value={name}
          onChange={(e) => setCell('name', e.target.value)}
          placeholder={
            crop
              ? `${crop.name} ${t('cropTracker.fieldLabel')}`
              : t('cropTracker.fieldNamePlaceholder')
          }
          className="flex-grow-1"
          style={{ minWidth: '12rem' }}
        />
        <GroupedSinglePicker<CropOption>
          placeholder={t('cropTracker.cropPlaceholder')}
          value={selectedOption}
          suggestions={suggestions}
          completeMethod={completeCrops}
          onChange={handleSelectCrop}
          className="flex-grow-1"
          // Once planted, the field's crop is locked; harvest (or remove) to change it.
          disabled={isPlanted}
        />
        <Button
          label={isPlanted ? t('cropTracker.replant') : t('cropTracker.plant')}
          icon="pi pi-arrow-down"
          disabled={!crop}
          onClick={handlePlant}
        />
        <Button
          label={t('cropTracker.harvest')}
          icon="pi pi-shopping-cart"
          severity="success"
          disabled={!isPlanted}
          onClick={handleHarvest}
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          aria-label={t('cropTracker.removeField')}
          onClick={() => onRemove(plantingId)}
        />
      </div>

      {isPlanted && (
        <>
          <div className="flex align-items-center gap-3 flex-wrap text-sm text-color-secondary">
            {status && (
              <Tag
                value={t(`cropTracker.status${status[0].toUpperCase()}${status.slice(1)}`)}
                severity={
                  status === 'ready' ? 'success' : status === 'pickable' ? 'warning' : 'info'
                }
              />
            )}
            {plantedDate && (
              <span>{t('cropTracker.plantedAt', { time: timeFormat.format(plantedDate) })}</span>
            )}
            {pickableDate && (
              <span>{t('cropTracker.pickableAt', { time: timeFormat.format(pickableDate) })}</span>
            )}
            {harvestDate &&
              (() => {
                const until = formatTimeUntil(harvestDate, now)
                return (
                  <span>
                    {t('cropTracker.harvestAt', { time: timeFormat.format(harvestDate) })}
                    {until && ` (${t('cropTracker.timeUntil', { duration: until })})`}
                  </span>
                )
              })()}
          </div>
          <div className="relative">
            <ProgressBar
              value={Math.round(progress * 100)}
              showValue={false}
              style={{ height: '0.5rem' }}
            />
            {crop &&
              crop.pickableAtPercent > 0 && (
                // Marker showing where the crop becomes early-pickable.
                <div
                  className="absolute"
                  title={t('cropTracker.statusPickable')}
                  style={{
                    left: `${crop.pickableAtPercent * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'var(--yellow-500)',
                  }}
                />
              )}
          </div>
        </>
      )}
    </Card>
  )
}
