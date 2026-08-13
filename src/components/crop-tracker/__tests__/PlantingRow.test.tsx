import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { localeProvider } from '@/i18n/__tests__/locale-provider'
import { createBuildStore } from '@/stores/build-store'

import type { Crop } from '../crop-tracker-types'
import { PlantingRow } from '../PlantingRow'

import '@/i18n'

// Values from Eco v13.0.4. First/full yield at rate 1:
//   Corn      1-3 range -> first at 1/sqrt(2) = 13.58h, full 19.2h
//   Tomato    pick window 0.8    -> first 23.04h, full 28.8h
//   Oak       sapling gate 0.3   -> first 50.4h, full 168h
//   Pineapple 1-1 range          -> first and full both 28.8h (single milestone)
const corn: Crop = {
  id: 'corn',
  name: 'Corn',
  rawName: 'CornItem',
  isTree: false,
  maturityAgeDays: 0.8,
  postHarvestingGrowth: 0,
  pickableAtPercent: 0,
  primaryResourceMin: 1,
  primaryResourceMax: 3,
}
const tomato: Crop = {
  id: 'tomato',
  name: 'Tomato',
  rawName: 'TomatoItem',
  isTree: false,
  maturityAgeDays: 1.2,
  postHarvestingGrowth: 0.5,
  pickableAtPercent: 0.8,
  primaryResourceMin: 1,
  primaryResourceMax: 3,
}
const oak: Crop = {
  id: 'oak',
  name: 'Oak',
  rawName: 'OakLogItem',
  isTree: true,
  maturityAgeDays: 7,
  postHarvestingGrowth: 0,
  pickableAtPercent: 0,
  primaryResourceMin: 0,
  primaryResourceMax: 120,
}
const pineapple: Crop = {
  id: 'pineapple',
  name: 'Pineapple',
  rawName: 'PineappleItem',
  isTree: false,
  maturityAgeDays: 1.2,
  postHarvestingGrowth: 0.5,
  pickableAtPercent: 0.8,
  primaryResourceMin: 1,
  primaryResourceMax: 1,
}
const allCrops = [corn, tomato, oak, pineapple]
const cropsById = new Map<string, Crop>(allCrops.map((c) => [c.id, c]))

function setup(cropItemId: string, plantedAt = '', hasRegrown = false, now?: Date) {
  const buildStore = createBuildStore()
  buildStore.setRow('userPlantings', 'p1', {
    id: 'p1',
    buildId: 'b1',
    cropItemId,
    plantedAt,
    hasRegrown,
  })
  render(
    <PlantingRow
      buildStore={buildStore}
      plantingId="p1"
      crops={allCrops}
      cropsById={cropsById}
      growthRateModifier={1}
      now={now ?? new Date('2026-01-02T00:00:00.000Z')}
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

  it('plants the crop and shows both yield milestones with a growing status', () => {
    const buildStore = setup('corn')
    fireEvent.click(screen.getByText('Plant'))

    expect(buildStore.getCell('userPlantings', 'p1', 'plantedAt')).not.toBe('')
    expect(screen.getByText('Growing')).toBeInTheDocument()
    expect(screen.getByText(/^First yield /)).toBeInTheDocument()
    expect(screen.getByText(/^Full yield /)).toBeInTheDocument()
  })

  it('renders each milestone and its countdown as one catalog phrase', () => {
    // The parentheses and word order used to be glued on in JSX, leaving a
    // translator unable to move either.
    // 2h in: corn first yields at 13.58h and finishes at 19.2h, so both
    // milestones still have a countdown.
    setup('corn', '2026-01-01T00:00:00.000Z', false, new Date('2026-01-01T02:00:00.000Z'))
    expect(screen.getByText(/^First yield .+ \(in .+\)$/)).toBeInTheDocument()
    expect(screen.getByText(/^Full yield .+ \(in .+\)$/)).toBeInTheDocument()
  })

  it('drops the countdown clause once a milestone has passed', () => {
    // `timeUntilParts` returns null for a past target, and the catalog has a
    // separate no-countdown phrase rather than an empty pair of parens.
    setup('corn', '2026-01-01T00:00:00.000Z', false, new Date('2026-01-05T00:00:00.000Z'))
    expect(screen.getByText(/^Full yield /).textContent).not.toContain('(')
  })

  it('says "less than a minute" instead of an empty countdown', () => {
    // Corn fully yields 19.2h after planting; 30s short of that, no d/h/m unit
    // can express what is left.
    setup(
      'corn',
      '2026-01-01T00:00:00.000Z',
      false,
      new Date('2026-01-01T19:11:30.000Z') // 19.2h = 19:12:00
    )
    expect(screen.getByText(/^Full yield .+ \(in <1m\)$/)).toBeInTheDocument()
  })

  it('names an unnamed field after its crop through the catalog', () => {
    setup('corn')
    expect(screen.getByPlaceholderText('Corn Field')).toBeInTheDocument()
  })

  it('shows a partial-yield badge between the two milestones', () => {
    // Planted 24h ago: tomato first yields at 23.04h, fully grown at 28.8h.
    const plantedAt = new Date('2026-01-01T00:00:00.000Z').toISOString()
    setup('tomato', plantedAt)

    // Exact-match the status Tag (the "First yield {time}" line is not exact).
    expect(screen.getByText('Partial yield')).toBeInTheDocument()
    expect(screen.getByText(/^First yield /)).toBeInTheDocument()
    expect(screen.getByText(/^Full yield /)).toBeInTheDocument()
  })

  it('shows a tree as partially yielding long before it is fully grown', () => {
    // Oak first yields at the 0.3 sapling gate (50.4h) and finishes at 168h.
    setup('oak', '2026-01-01T00:00:00.000Z', false, new Date('2026-01-04T00:00:00.000Z'))
    expect(screen.getByText('Partial yield')).toBeInTheDocument()
  })

  it('marks a planting ready only once fully grown', () => {
    setup('oak', '2026-01-01T00:00:00.000Z', false, new Date('2026-01-09T00:00:00.000Z'))
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.queryByText('Partial yield')).not.toBeInTheDocument()
  })

  it('shows a single milestone when first yield coincides with full yield', () => {
    // Pineapple's 1-1 range yields nothing until growth 1.0, so its 80% pick
    // window is meaningless and two identical timestamps would read as a bug.
    setup('pineapple', '2026-01-01T00:00:00.000Z')
    expect(screen.queryByText(/^First yield /)).not.toBeInTheDocument()
    expect(screen.getByText(/^Full yield /)).toBeInTheDocument()
    expect(screen.queryByText('Partial yield')).not.toBeInTheDocument()
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

  // Timestamps previously went through a module-scope Intl.DateTimeFormat built
  // with locale `undefined`, which followed the browser rather than the app and
  // was frozen at import time.
  describe('timestamp localization', () => {
    function renderAt(locale: string) {
      const buildStore = createBuildStore()
      buildStore.setRow('userPlantings', 'p1', {
        id: 'p1',
        buildId: 'b1',
        cropItemId: 'corn',
        plantedAt: '2026-03-05T08:30:00.000Z',
        hasRegrown: false,
      })
      return render(
        <PlantingRow
          buildStore={buildStore}
          plantingId="p1"
          crops={allCrops}
          cropsById={cropsById}
          growthRateModifier={1}
          now={new Date('2026-03-05T09:00:00.000Z')}
          onRemove={() => {}}
        />,
        { wrapper: localeProvider(locale) }
      )
    }

    it('renders countdown units in the app locale', () => {
      // The d/h/m abbreviations were hardcoded English; narrow-style German
      // writes minutes as "Min.".
      const en = renderAt('en-US')
      expect(en.container.textContent).toMatch(/\(in \d+h \d+m\)/)
      en.unmount()

      const de = renderAt('de-DE')
      expect(de.container.textContent).toContain('Min.')
    })

    it('renders month names in the app locale, not the browser default', () => {
      const en = renderAt('en-US')
      expect(en.container.textContent).toContain('Mar')
      en.unmount()

      // de-DE abbreviates March as "März" and puts the day first.
      const de = renderAt('de-DE')
      expect(de.container.textContent).toContain('März')
      expect(de.container.textContent).not.toContain('Mar 5')
    })
  })
})
