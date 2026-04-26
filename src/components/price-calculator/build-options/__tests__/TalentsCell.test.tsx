import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import type { TalentRow } from '../skills-types'
import { TalentsCell } from '../TalentsCell'

const talents: TalentRow[] = [
  {
    id: 't-low',
    userTalentId: 'ut-low',
    name: 'Easy',
    talentGroupName: 'g',
    level: 1,
    isLevelable: false,
    maxTalentLevel: 0,
  },
  {
    id: 't-high',
    userTalentId: 'ut-high',
    name: 'Hard',
    talentGroupName: 'g',
    level: 5,
    isLevelable: false,
    maxTalentLevel: 0,
  },
]

describe('TalentsCell', () => {
  it('renders only talents available at the user skill level', () => {
    const build = createBuildStore()
    build.setRow('userSkills', 'us1', { id: 'us1', buildId: 'b', skillId: 'sk', level: 3 })
    for (const t of talents) {
      build.setRow('userTalents', t.userTalentId, {
        id: t.userTalentId,
        buildId: 'b',
        talentId: t.id,
        enabled: false,
      })
    }
    const { container } = render(
      <TalentsCell
        buildStore={build}
        userSkillId="us1"
        talents={talents}
        onToggle={() => {}}
        onSetLevel={() => {}}
      />
    )
    // Two talent slots — only the level-1 one is in range, plus one chip = 1 child div in the wrap.
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('renders nothing when no talents are available at the current level', () => {
    const build = createBuildStore()
    build.setRow('userSkills', 'us1', { id: 'us1', buildId: 'b', skillId: 'sk', level: 0 })
    const { container } = render(
      <TalentsCell
        buildStore={build}
        userSkillId="us1"
        talents={talents}
        onToggle={() => {}}
        onSetLevel={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
