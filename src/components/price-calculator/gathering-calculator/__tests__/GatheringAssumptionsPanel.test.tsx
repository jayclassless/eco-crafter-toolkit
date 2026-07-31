import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GatheringSpeciesOption } from '../gathering-data'
import { GatheringAssumptionsPanel } from '../GatheringAssumptionsPanel'

import '@/i18n'

const SPECIES: GatheringSpeciesOption = {
  id: 'sp1',
  name: 'Spruce',
  treeHealth: 15,
  logsPerTreeMin: 0,
  logsPerTreeMax: 75,
}

function renderPanel(overrides: Partial<Parameters<typeof GatheringAssumptionsPanel>[0]> = {}) {
  const props = {
    kind: 'rock' as const,
    caloriesPerRubblePickup: 1,
    onCaloriesPerRubblePickup: vi.fn(),
    logsPerTree: 75,
    onLogsPerTree: vi.fn(),
    species: null,
    hitRate: 1,
    onHitRate: vi.fn(),
    headshot: false,
    onHeadshot: vi.fn(),
    arrowPrice: 0.5,
    onArrowPrice: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<GatheringAssumptionsPanel {...props} />) }
}

/** NumericField debounces and commits on blur, so both events are needed. */
function commit(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

function fieldInput(label: string): HTMLInputElement {
  return screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement
}

describe('GatheringAssumptionsPanel', () => {
  it('shows only the rubble assumption for a rock', () => {
    renderPanel({ kind: 'rock' })
    expect(screen.getByText('Calories per rubble pickup')).toBeTruthy()
    expect(screen.queryByText('Logs per tree')).toBeNull()
    expect(screen.queryByText('Hit rate')).toBeNull()
  })

  it('shows nothing for an excavatable', () => {
    // Digging has no underivable assumptions: one swing, one block, one item.
    const { container } = renderPanel({ kind: 'excavatable' })
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })

  it('commits an edited rubble pickup cost', () => {
    const { props } = renderPanel({ kind: 'rock' })
    commit(fieldInput('Calories per rubble pickup'), '5')
    expect(props.onCaloriesPerRubblePickup).toHaveBeenCalledWith(5)
  })

  it('shows logs per tree with the species range for a log', () => {
    renderPanel({ kind: 'log', species: SPECIES })
    expect(screen.getByText('Logs per tree')).toBeTruthy()
    expect(screen.getByText(/A fully grown tree yields 75/)).toBeTruthy()
  })

  it('omits the range hint when no species is known', () => {
    renderPanel({ kind: 'log', species: null })
    expect(screen.getByText('Logs per tree')).toBeTruthy()
    expect(screen.queryByText(/A fully grown tree yields/)).toBeNull()
  })

  it('commits an edited logs-per-tree value', () => {
    const { props } = renderPanel({ kind: 'log', species: SPECIES })
    commit(fieldInput('Logs per tree'), '40')
    expect(props.onLogsPerTree).toHaveBeenCalledWith(40)
  })

  it('shows the hunting assumptions for a carcass', () => {
    renderPanel({ kind: 'carcass' })
    expect(screen.getByText('Hit rate')).toBeTruthy()
    expect(screen.getByText('Aim for the head')).toBeTruthy()
    expect(screen.getByText('Arrow price')).toBeTruthy()
  })

  it('reports the hit rate as a fraction, not a percentage', () => {
    const { props } = renderPanel({ kind: 'carcass' })
    commit(fieldInput('Hit rate'), '50')
    expect(props.onHitRate).toHaveBeenCalledWith(0.5)
  })

  it('clamps the hit rate into a usable range', () => {
    // A rate of 0 would mean infinite shots; above 1 is meaningless.
    const { props } = renderPanel({ kind: 'carcass' })
    commit(fieldInput('Hit rate'), '0')
    expect(props.onHitRate).toHaveBeenLastCalledWith(0.01)
  })

  it('toggles the headshot flag', () => {
    const { props } = renderPanel({ kind: 'carcass' })
    fireEvent.click(document.body.querySelector('#gathering-headshot') as HTMLInputElement)
    expect(props.onHeadshot).toHaveBeenCalledWith(true)
  })

  it('commits an overridden arrow price', () => {
    const { props } = renderPanel({ kind: 'carcass' })
    commit(fieldInput('Arrow price'), '1.25')
    expect(props.onArrowPrice).toHaveBeenCalledWith(1.25)
  })
})
