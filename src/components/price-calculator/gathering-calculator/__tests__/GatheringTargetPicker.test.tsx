import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GatheringOption } from '../gathering-data'
import { GatheringTargetPicker } from '../GatheringTargetPicker'

import '@/i18n'

const OPTIONS: GatheringOption[] = [
  {
    itemId: 'it-granite',
    kind: 'rock',
    name: 'Granite',
    rawName: 'GraniteItem',
    target: { kind: 'rock', hardness: 3, itemsPerBlock: 4 },
  },
  {
    itemId: 'it-dirt',
    kind: 'excavatable',
    name: 'Dirt',
    rawName: 'DirtItem',
    target: { kind: 'excavatable' },
  },
  {
    itemId: 'it-spruce',
    kind: 'log',
    name: 'Spruce Log',
    rawName: 'SpruceLogItem',
    target: { kind: 'log', treeHealth: 15 },
    species: [
      { id: 'sp1', name: 'Spruce', treeHealth: 15, logsPerTreeMin: 0, logsPerTreeMax: 75 },
      {
        id: 'sp2',
        name: 'Titan Spruce',
        treeHealth: 300,
        logsPerTreeMin: 700,
        logsPerTreeMax: 800,
      },
    ],
  },
  {
    itemId: 'it-deer',
    kind: 'carcass',
    name: 'Deer',
    rawName: 'DeerCarcassItem',
    target: { kind: 'carcass', animalHealth: 6 },
  },
]

function renderPicker(overrides: Partial<Parameters<typeof GatheringTargetPicker>[0]> = {}) {
  const props = {
    options: OPTIONS,
    selected: null,
    onSelect: vi.fn(),
    speciesId: '',
    onSelectSpecies: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<GatheringTargetPicker {...props} />) }
}

/** Types into the AutoComplete, which is what drives its completeMethod. */
async function search(query: string) {
  const input = screen.getByPlaceholderText(/Search for a rock/) as HTMLInputElement
  fireEvent.change(input, { target: { value: query } })
}

/** Opens the full list via the dropdown button (an empty typed query does not
 * open the panel on its own). */
function showAll() {
  fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLElement)
}

describe('GatheringTargetPicker', () => {
  it('groups suggestions by gathering kind in a fixed order', async () => {
    renderPicker()
    showAll()
    await waitFor(() => {
      const groups = [...document.body.querySelectorAll('.p-autocomplete-item-group')].map(
        (el) => el.textContent
      )
      expect(groups).toEqual(['Rocks & Ores', 'Excavatables', 'Logs', 'Carcasses'])
    })
  })

  it('filters suggestions by name', async () => {
    renderPicker()
    await search('spru')
    await waitFor(() => {
      const groups = [...document.body.querySelectorAll('.p-autocomplete-item-group')].map(
        (el) => el.textContent
      )
      expect(groups).toEqual(['Logs'])
    })
  })

  it('drops a group entirely when nothing in it matches', async () => {
    renderPicker()
    showAll()
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-autocomplete-item-group').length).toBeGreaterThan(0)
    })
    await search('zzz-no-such-thing')
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-autocomplete-item-group')).toHaveLength(0)
    })
  })

  it('shows the current selection', () => {
    renderPicker({ selected: OPTIONS[0] })
    expect(screen.getByDisplayValue('Granite')).toBeTruthy()
  })

  it('hides the species picker for a target with one species', () => {
    const { container } = renderPicker({ selected: OPTIONS[1] })
    expect(container.querySelector('.p-dropdown')).toBeNull()
  })

  it('offers a species picker only when a log has more than one', () => {
    // Redwood and Old-Growth Redwood both yield Redwood Log — the case that
    // forced tree species into their own table.
    const { container } = renderPicker({ selected: OPTIONS[2], speciesId: 'sp1' })
    expect(container.querySelector('.p-dropdown')).toBeTruthy()
  })

  it('reports a species change', async () => {
    const { props, container } = renderPicker({ selected: OPTIONS[2], speciesId: 'sp1' })
    fireEvent.click(container.querySelector('.p-dropdown') as HTMLElement)
    const option = await waitFor(() => {
      const found = [...document.body.querySelectorAll('.p-dropdown-item')].find(
        (el) => el.textContent === 'Titan Spruce'
      )
      expect(found).toBeTruthy()
      return found!
    })
    fireEvent.click(option)
    expect(props.onSelectSpecies).toHaveBeenCalledWith('sp2')
  })
})
