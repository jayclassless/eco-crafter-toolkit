import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TalentRow } from '../skills-types'
import { TalentChipView } from '../TalentChipView'

// PrimeReact's Tooltip only renders its content on hover, so capture the
// composed string from props instead of driving a hover interaction.
const tooltipContent = vi.hoisted(() => ({ current: '' }))

vi.mock('primereact/tooltip', () => ({
  Tooltip: ({ content }: { content: string }) => {
    tooltipContent.current = content
    return null
  },
}))

const baseTalent: TalentRow = {
  id: 't1',
  userTalentId: 'ut1',
  name: 'Sharp',
  talentGroupName: 'Precision',
  level: 1,
  isLevelable: false,
  maxTalentLevel: 0,
}

function renderChip(talent: TalentRow, talentLevel = 0) {
  render(
    <TalentChipView
      talent={talent}
      enabled={false}
      talentLevel={talentLevel}
      onToggle={() => {}}
      onSetLevel={() => {}}
    />
  )
  return tooltipContent.current
}

describe('TalentChipView tooltip', () => {
  it('shows the description below the name for a non-levelable talent', () => {
    const content = renderChip({ ...baseTalent, description: 'Sharpens related tools.' })
    expect(content).toBe('Sharp\n\nSharpens related tools.')
  })

  it('orders name, description, then the level hint for a levelable talent', () => {
    const content = renderChip(
      {
        ...baseTalent,
        description: 'Sharpens related tools.',
        isLevelable: true,
        maxTalentLevel: 5,
      },
      2
    )
    expect(content).toBe(
      'Sharp (level 2/5)\n\nSharpens related tools.\n\n(click to increase, shift/right-click to decrease)'
    )
  })

  it('omits the description section when the dataset has none', () => {
    expect(renderChip(baseTalent)).toBe('Sharp')
  })

  it('keeps the level hint adjacent to the name when the description is absent', () => {
    const content = renderChip({ ...baseTalent, isLevelable: true, maxTalentLevel: 5 }, 1)
    expect(content).toBe('Sharp (level 1/5)\n\n(click to increase, shift/right-click to decrease)')
  })
})
