import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import type { Crop } from '../crop-tracker-types'
import { PlantingRow } from '../PlantingRow'

import '@/i18n'

const corn: Crop = {
  id: 'corn',
  name: 'Corn',
  rawName: 'CornItem',
  isTree: false,
  maturityAgeDays: 0.8,
  postHarvestingGrowth: 0,
  pickableAtPercent: 0,
}
const tomato: Crop = {
  id: 'tomato',
  name: 'Tomato',
  rawName: 'TomatoItem',
  isTree: false,
  maturityAgeDays: 1.2,
  postHarvestingGrowth: 0.5,
  pickableAtPercent: 0.8,
}
const oak: Crop = {
  id: 'oak',
  name: 'Oak',
  rawName: 'OakLogItem',
  isTree: true,
  maturityAgeDays: 7,
  postHarvestingGrowth: 0,
  pickableAtPercent: 0,
}
const cropsById = new Map<string, Crop>([
  [corn.id, corn],
  [tomato.id, tomato],
  [oak.id, oak],
])

function setup(cropItemId: string, plantedAt = '', hasRegrown = false) {
  const buildStore = createBuildStore()
  buildStore.setRow('userPlantings', 'p1', {
    id: 'p1',
    buildId: 'b1',
    cropItemId,
    plantedAt,
    hasRegrown,
  })
  const now = new Date('2026-01-02T00:00:00.000Z')
  render(
    <PlantingRow
      buildStore={buildStore}
      plantingId="p1"
      crops={[corn, tomato, oak]}
      cropsById={cropsById}
      growthRateModifier={1}
      now={now}
      onRemove={() => {}}
    />
  )
  return buildStore
}

describe('PlantingRow', () => {
  it('separates crops and trees into groups in the picker dropdown', () => {
    const { container } = render(
      <PlantingRow
        buildStore={(() => {
          const s = createBuildStore()
          s.setRow('userPlantings', 'p1', { id: 'p1', buildId: 'b1', cropItemId: '' })
          return s
        })()}
        plantingId="p1"
        crops={[corn, tomato, oak]}
        cropsById={cropsById}
        growthRateModifier={1}
        now={new Date('2026-01-02T00:00:00.000Z')}
        onRemove={() => {}}
      />
    )
    // Open the picker dropdown to run completeMethod and render the groups.
    const dropdown = container.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)

    expect(screen.getByText('Crops')).toBeInTheDocument()
    expect(screen.getByText('Trees')).toBeInTheDocument()
  })

  it('locks the crop picker once planted and unlocks it when unplanted', () => {
    const buildStore = setup('corn', '2026-01-01T00:00:00.000Z')
    expect(document.querySelector('.p-autocomplete-input')).toBeDisabled()

    // Harvesting a single-harvest crop clears the planting and re-enables it.
    fireEvent.click(screen.getByText('Harvest'))
    expect(buildStore.getCell('userPlantings', 'p1', 'plantedAt')).toBe('')
    expect(document.querySelector('.p-autocomplete-input')).not.toBeDisabled()
  })

  it('plants the crop and shows a harvest time and growing status', () => {
    const buildStore = setup('corn')
    fireEvent.click(screen.getByText('Plant'))

    expect(buildStore.getCell('userPlantings', 'p1', 'plantedAt')).not.toBe('')
    expect(screen.getByText('Growing')).toBeInTheDocument()
    expect(screen.getByText(/^Harvest /)).toBeInTheDocument()
    // A non-pickable crop shows no early-pickable line.
    expect(screen.queryByText('Pickable')).not.toBeInTheDocument()
  })

  it('shows the early-pickable time and badge once a regen crop is pickable', () => {
    // Planted 24h ago: tomato is pickable at 23.04h, fully grown at 28.8h.
    const plantedAt = new Date('2026-01-01T00:00:00.000Z').toISOString()
    setup('tomato', plantedAt)

    // Exact-match the status Tag (the "Pickable {time}" line is not an exact match).
    expect(screen.getByText('Pickable')).toBeInTheDocument()
    expect(screen.getByText(/^Pickable /)).toBeInTheDocument()
    expect(screen.getByText(/^Harvest /)).toBeInTheDocument()
  })

  it('clears the planting when a single-harvest crop is harvested', () => {
    const buildStore = setup('corn', '2026-01-01T00:00:00.000Z')
    fireEvent.click(screen.getByText('Harvest'))
    expect(buildStore.getCell('userPlantings', 'p1', 'plantedAt')).toBe('')
    expect(buildStore.getCell('userPlantings', 'p1', 'hasRegrown')).toBe(false)
  })

  it('regrows a regen crop on a shorter cycle when harvested', () => {
    const buildStore = setup('tomato', '2026-01-01T00:00:00.000Z')
    fireEvent.click(screen.getByText('Harvest'))
    expect(buildStore.getCell('userPlantings', 'p1', 'hasRegrown')).toBe(true)
    // Re-planted (a fresh plantedAt timestamp), not cleared.
    expect(buildStore.getCell('userPlantings', 'p1', 'plantedAt')).not.toBe('')
  })
})
