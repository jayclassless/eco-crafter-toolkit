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
import { useLocalization } from '@/hooks/use-localization'
import { useCellValue } from '@/hooks/use-store-revision'
import {
  computeHarvestWindow,
  harvestProgress,
  isRegrowCrop,
  timeUntilParts,
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

// Harvest timestamps are always within a few in-game days, so the year is
// dropped. `hourCycle` pins 24h across locales to keep the row compact —
// an "AM/PM" suffix pushes these onto a second line on narrow screens.
const HARVEST_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}

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
  const { formatDate, formatDurationParts } = useLocalization()
  const [suggestions, setSuggestions] = useState<GroupedSinglePickerGroup<CropOption>[]>([])
  const formatTime = (value: Date) => formatDate(value, HARVEST_TIME_OPTIONS)

  // '' when the milestone has passed, so callers can fall back to the phrasing
  // that carries no countdown clause.
  const formatCountdown = (target: Date): string => {
    const parts = timeUntilParts(target, now)
    if (!parts) return ''
    // All-zero parts mean under a minute is left — still counting down, but no
    // unit can say so.
    if (parts.days === 0 && parts.hours === 0 && parts.minutes === 0) {
      return t('common.lessThan', { duration: formatDurationParts({ minutes: 1 }) })
    }
    return formatDurationParts(parts)
  }

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

  const window =
    crop && isPlanted
      ? computeHarvestWindow(plantedAt, crop, growthRateModifier, { hasRegrown })
      : null

  const plantedDate = isPlanted ? new Date(plantedAt) : null
  // Progress runs to full yield; first yield is a marker along the way.
  const progress = plantedDate && window ? harvestProgress(plantedDate, window.maxYieldAt, now) : 0

  // Species whose first yield only arrives at full growth (Pineapple's 1-1
  // range, or a dataset with no range data) have a single milestone — showing
  // two identical timestamps reads as a bug.
  const hasSeparateFirstYield = window != null && window.firstYieldGrowth < 1

  const status: 'ready' | 'partial' | 'growing' | null = !isPlanted
    ? null
    : window && now >= window.maxYieldAt
      ? 'ready'
      : window && hasSeparateFirstYield && now >= window.firstYieldAt
        ? 'partial'
        : 'growing'

  // Where the first-yield marker sits on the bar. The bar spans the visible
  // cycle, which for a regrow starts partway up, so rescale into that span.
  const firstYieldMarker =
    window && hasSeparateFirstYield
      ? (window.firstYieldGrowth - window.cycleStartGrowth) / (1 - window.cycleStartGrowth)
      : null

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
              ? t('cropTracker.fieldNameDefault', { crop: crop.name })
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
                  status === 'ready' ? 'success' : status === 'partial' ? 'warning' : 'info'
                }
              />
            )}
            {plantedDate && (
              <span>{t('cropTracker.plantedAt', { time: formatTime(plantedDate) })}</span>
            )}
            {window &&
              hasSeparateFirstYield &&
              (() => {
                const until = formatCountdown(window.firstYieldAt)
                const time = formatTime(window.firstYieldAt)
                return (
                  <span>
                    {until
                      ? t('cropTracker.firstYieldAtWithUntil', { time, duration: until })
                      : t('cropTracker.firstYieldAt', { time })}
                  </span>
                )
              })()}
            {window &&
              (() => {
                const until = formatCountdown(window.maxYieldAt)
                const time = formatTime(window.maxYieldAt)
                return (
                  <span>
                    {until
                      ? t('cropTracker.fullYieldAtWithUntil', { time, duration: until })
                      : t('cropTracker.fullYieldAt', { time })}
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
            {firstYieldMarker != null && (
              // Marker showing where the plant starts yielding something.
              <div
                className="absolute"
                title={t('cropTracker.statusPartial')}
                style={{
                  left: `${firstYieldMarker * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: '4px',
                  // Centre the marker on the threshold rather than letting it
                  // grow rightwards, which would read as a later time.
                  transform: 'translateX(-50%)',
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
