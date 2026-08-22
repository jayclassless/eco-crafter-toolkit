import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestStores, makeWrapper } from '@/hooks/__tests__/store-wrapper'
import { getCompare } from '@/lib/collator'

import { FurnishingsTable } from '../FurnishingsTable'
import { sortFurnishings } from '../housing-sort'
import type { FurnishingRow } from '../housing-types'

import '@/i18n'

const compare = getCompare('en-US')

function row(name: string, baseValue: number): FurnishingRow {
  return {
    itemId: name,
    name,
    rawName: `${name}Item`,
    categoryName: 'Seating',
    categoryDisplayName: 'Seating',
    categoryColor: '#E5956E',
    typeForRoomLimit: 'Chair',
    baseValue,
    repeatReduction: 0.4,
    skillIds: [],
    skillNames: [],
    skillRawNames: [],
    skillLabel: '',
  }
}

// Rows that only our comparator can order: all three tie on baseValue, and
// they are handed to the table in reverse name order.
const TIED = [row('Charlie', 3), row('Bravo', 3), row('Alpha', 3)]

// useTableVirtualScroll reads the UI scale off the store, so the table needs
// the provider even though it holds no state of its own.
function renderTable(rows: FurnishingRow[], onSortChange = vi.fn()) {
  renderWithStores(
    <FurnishingsTable
      rows={rows}
      sortField="baseValue"
      sortDir="desc"
      onSortChange={onSortChange}
      emptyMessage="none"
    />
  )
  return onSortChange
}

function renderWithStores(ui: React.ReactElement) {
  const Wrapper = makeWrapper(createTestStores())
  return render(<Wrapper>{ui}</Wrapper>)
}

const renderedNames = () =>
  Array.from(document.querySelectorAll('tbody tr')).map(
    (tr) => tr.querySelector('td')?.textContent?.trim() ?? ''
  )

describe('FurnishingsTable', () => {
  it('reports the clicked column and direction', () => {
    const onSortChange = renderTable(TIED)
    fireEvent.click(screen.getByText('Item'))
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
  })

  it('reports desc when the same column is clicked again', () => {
    const onSortChange = vi.fn()
    renderWithStores(
      <FurnishingsTable
        rows={TIED}
        sortField="name"
        sortDir="asc"
        onSortChange={onSortChange}
        emptyMessage="none"
      />
    )
    fireEvent.click(screen.getByText('Item'))
    expect(onSortChange).toHaveBeenCalledWith('name', 'desc')
  })

  it('preserves the secondary name sort our comparator applied', () => {
    renderTable(sortFurnishings(TIED, 'baseValue', 'desc', compare))
    expect(renderedNames()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  // Regression guard for the `lazy` prop: without it PrimeReact re-sorts
  // `value` itself, and its comparator does not agree with ours about null.
  // We treat a null repeat penalty as the best case (it leads ascending);
  // PrimeReact sinks nulls to the bottom. Drop `lazy` and "None" moves last.
  it('renders the order our comparator produced, including null placement', () => {
    const rows: FurnishingRow[] = [
      { ...row('None', 1), repeatReduction: null },
      { ...row('Half', 1), repeatReduction: 0.4 },
      { ...row('Full', 1), repeatReduction: 1 },
    ]
    const sorted = sortFurnishings(rows, 'repeatReduction', 'asc', compare)
    expect(sorted.map((r) => r.name)).toEqual(['None', 'Half', 'Full'])
    renderWithStores(
      <FurnishingsTable
        rows={sorted}
        sortField="repeatReduction"
        sortDir="asc"
        onSortChange={vi.fn()}
        emptyMessage="none"
      />
    )
    expect(renderedNames()).toEqual(['None', 'Half', 'Full'])
  })
})
