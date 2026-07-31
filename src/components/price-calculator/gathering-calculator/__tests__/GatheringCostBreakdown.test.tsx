import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { GatheringResult } from '@/lib/gathering-calc'

import { GatheringCostBreakdown } from '../GatheringCostBreakdown'

import '@/i18n'

function result(overrides: Partial<GatheringResult> = {}): GatheringResult {
  return {
    caloriesPerAction: 20,
    damagePerHit: 2,
    itemsPerSource: 60,
    caloriesPerItem: 8.67,
    calorieCostPerItem: 0.17,
    consumableCostPerItem: 0,
    pricePerItem: 0.17,
    lines: [
      { key: 'fell', count: 15, caloriesPerSource: 300, calories: 5, cost: 0.1 },
      { key: 'slice', count: 11, caloriesPerSource: 220, calories: 3.67, cost: 0.07 },
    ],
    ...overrides,
  }
}

function row(label: string): HTMLElement {
  return screen.getByText(label).parentElement as HTMLElement
}

describe('GatheringCostBreakdown', () => {
  it('shows per-source figures next to the per-item share', () => {
    // The whole point of the extra columns: "0.25 actions to fell a tree" on
    // its own hides that felling is a real 15-swing, 300-calorie job.
    render(<GatheringCostBreakdown result={result()} kind="log" itemName="Oak Log" />)
    const cells = [...row('Fell the tree').querySelectorAll('td')].map((c) => c.textContent)
    expect(cells).toEqual(['Fell the tree', '15', '300', '5', '0.10'])
  })

  it('labels the columns with the source and item names', () => {
    render(<GatheringCostBreakdown result={result()} kind="log" itemName="Oak Log" />)
    expect(screen.getByText('Actions / tree')).toBeTruthy()
    expect(screen.getByText('Cal / tree')).toBeTruthy()
    expect(screen.getByText('Cal / Oak Log')).toBeTruthy()
    expect(screen.getByText('Total per tree')).toBeTruthy()
  })

  it('names the source per gathering kind', () => {
    const { rerender } = render(
      <GatheringCostBreakdown result={result()} kind="rock" itemName="Granite" />
    )
    expect(screen.getByText('Actions / block')).toBeTruthy()
    rerender(<GatheringCostBreakdown result={result()} kind="carcass" itemName="Deer" />)
    expect(screen.getByText('Actions / animal')).toBeTruthy()
  })

  it('totals the per-source columns as well as the per-item ones', () => {
    render(<GatheringCostBreakdown result={result()} kind="log" itemName="Oak Log" />)
    const cells = [...row('Total per tree').querySelectorAll('td')].map((c) => c.textContent)
    expect(cells).toEqual(['Total per tree', '26', '520', '8.67', '0.17'])
  })

  it('dashes out calories for a consumable line rather than showing zero', () => {
    // Arrows cost money but no calories; a literal 0 would read as free.
    render(
      <GatheringCostBreakdown
        result={result({
          lines: [
            { key: 'shots', count: 6, caloriesPerSource: 120, calories: 120, cost: 2.4 },
            { key: 'arrows', count: 6, caloriesPerSource: 0, calories: 0, cost: 3 },
          ],
        })}
        kind="carcass"
        itemName="Deer"
      />
    )
    const cells = [...row('Arrows consumed').querySelectorAll('td')].map((c) => c.textContent)
    expect(cells).toEqual(['Arrows consumed', '6', '—', '—', '3.00'])
  })

  it('excludes consumable lines from the action total', () => {
    render(
      <GatheringCostBreakdown
        result={result({
          lines: [
            { key: 'shots', count: 6, caloriesPerSource: 120, calories: 120, cost: 2.4 },
            { key: 'arrows', count: 6, caloriesPerSource: 0, calories: 0, cost: 3 },
          ],
        })}
        kind="carcass"
        itemName="Deer"
      />
    )
    // 6 shots are actions; the 6 arrows they consume are not.
    expect(row('Total per animal').querySelectorAll('td')[1].textContent).toBe('6')
  })

  it('summarizes the per-action cost, damage and yield', () => {
    render(<GatheringCostBreakdown result={result()} kind="log" itemName="Oak Log" />)
    expect(screen.getByText('20 cal per action')).toBeTruthy()
    expect(screen.getByText('2 damage per hit')).toBeTruthy()
    expect(screen.getByText('60 Oak Log per tree')).toBeTruthy()
  })
})
