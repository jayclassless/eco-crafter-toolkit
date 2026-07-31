import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GatheringTalentState } from '@/lib/gathering-calc'

import { GatheringTalentToggles } from '../GatheringTalentToggles'

import '@/i18n'

const TALENTS: GatheringTalentState = {
  efficiency: false,
  efficiencyValue: 0.8,
  strength: false,
  strengthValue: 1,
  empower: false,
  empowerValue: 1,
  luckyBreak: false,
  deadeye: false,
  arrowRecovery: false,
  arrowRecoveryValue: 0.5,
}

const NONE = {
  efficiency: false,
  strength: false,
  empower: false,
  luckyBreak: false,
  deadeye: false,
  arrowRecovery: false,
}

describe('GatheringTalentToggles', () => {
  it('renders only the talents the tool and target can have', () => {
    render(
      <GatheringTalentToggles
        talents={TALENTS}
        available={{ ...NONE, efficiency: true, luckyBreak: true }}
        onChange={() => {}}
      />
    )
    expect(screen.getByText('Tool Efficiency')).toBeTruthy()
    expect(screen.getByText('Lucky Break')).toBeTruthy()
    expect(screen.queryByText('Deadeye')).toBeNull()
    expect(screen.queryByText('Tool Strength')).toBeNull()
  })

  it('renders nothing when no talent applies', () => {
    // Shovels have no efficiency or strength talent, and digging has no
    // kind-specific ones — the row should collapse rather than sit empty.
    const { container } = render(
      <GatheringTalentToggles talents={TALENTS} available={NONE} onChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('reflects the current state', () => {
    render(
      <GatheringTalentToggles
        talents={{ ...TALENTS, efficiency: true }}
        available={{ ...NONE, efficiency: true }}
        onChange={() => {}}
      />
    )
    expect(
      (document.body.querySelector('#gathering-talent-efficiency') as HTMLInputElement).checked
    ).toBe(true)
  })

  it('emits the full state with just the clicked talent flipped', () => {
    const onChange = vi.fn()
    render(
      <GatheringTalentToggles
        talents={{ ...TALENTS, luckyBreak: true }}
        available={{ ...NONE, efficiency: true, luckyBreak: true }}
        onChange={onChange}
      />
    )
    fireEvent.click(document.body.querySelector('#gathering-talent-efficiency') as HTMLInputElement)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ efficiency: true, luckyBreak: true, efficiencyValue: 0.8 })
    )
  })

  it('orders the toggles consistently regardless of which apply', () => {
    render(
      <GatheringTalentToggles
        talents={TALENTS}
        available={{ ...NONE, arrowRecovery: true, deadeye: true, strength: true }}
        onChange={() => {}}
      />
    )
    const labels = [...document.body.querySelectorAll('label')].map((l) => l.textContent)
    expect(labels).toEqual(['Tool Strength', 'Deadeye', 'Arrow Recovery'])
  })
})
