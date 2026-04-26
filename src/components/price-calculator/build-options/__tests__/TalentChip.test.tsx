import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import type { TalentRow } from '../skills-types'
import { TalentChip } from '../TalentChip'

const baseTalent: TalentRow = {
  id: 't1',
  userTalentId: 'ut1',
  name: 'Sharp',
  talentGroupName: 'Precision',
  level: 1,
  isLevelable: false,
  maxTalentLevel: 0,
}

describe('TalentChip', () => {
  it('renders a non-levelable talent at low opacity when disabled', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: false,
    })
    const { container } = render(
      <TalentChip
        buildStore={build}
        talent={baseTalent}
        onToggle={() => {}}
        onSetLevel={() => {}}
      />
    )
    const root = container.firstChild as HTMLElement
    expect(root.style.opacity).toBe('0.3')
  })

  it('toggles a non-levelable talent on click', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: false,
    })
    const onToggle = vi.fn()
    const { container } = render(
      <TalentChip
        buildStore={build}
        talent={baseTalent}
        onToggle={onToggle}
        onSetLevel={() => {}}
      />
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onToggle).toHaveBeenCalledWith('t1', 'ut1', true)
  })

  it('clicking a levelable talent advances its level', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: true,
      talentLevel: 2,
    })
    const onSetLevel = vi.fn()
    const talent: TalentRow = { ...baseTalent, isLevelable: true, maxTalentLevel: 5 }
    const { container } = render(
      <TalentChip buildStore={build} talent={talent} onToggle={() => {}} onSetLevel={onSetLevel} />
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onSetLevel).toHaveBeenCalledWith('t1', 'ut1', 3)
  })

  it('shift-click on a levelable talent decreases the level (clamped to 0)', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: true,
      talentLevel: 0,
    })
    const onSetLevel = vi.fn()
    const talent: TalentRow = { ...baseTalent, isLevelable: true, maxTalentLevel: 5 }
    const { container } = render(
      <TalentChip buildStore={build} talent={talent} onToggle={() => {}} onSetLevel={onSetLevel} />
    )
    fireEvent.click(container.firstChild as HTMLElement, { shiftKey: true })
    expect(onSetLevel).toHaveBeenCalledWith('t1', 'ut1', 0)
  })

  it('clicking past max wraps a levelable talent back to 0', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: true,
      talentLevel: 5,
    })
    const onSetLevel = vi.fn()
    const talent: TalentRow = { ...baseTalent, isLevelable: true, maxTalentLevel: 5 }
    const { container } = render(
      <TalentChip buildStore={build} talent={talent} onToggle={() => {}} onSetLevel={onSetLevel} />
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onSetLevel).toHaveBeenCalledWith('t1', 'ut1', 0)
  })

  it('right-click on a levelable talent decreases the level', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: true,
      talentLevel: 3,
    })
    const onSetLevel = vi.fn()
    const talent: TalentRow = { ...baseTalent, isLevelable: true, maxTalentLevel: 5 }
    const { container } = render(
      <TalentChip buildStore={build} talent={talent} onToggle={() => {}} onSetLevel={onSetLevel} />
    )
    fireEvent.contextMenu(container.firstChild as HTMLElement)
    expect(onSetLevel).toHaveBeenCalledWith('t1', 'ut1', 2)
  })

  it('shows the current level badge for a levelable talent', () => {
    const build = createBuildStore()
    build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b',
      talentId: 't1',
      enabled: true,
      talentLevel: 4,
    })
    const talent: TalentRow = { ...baseTalent, isLevelable: true, maxTalentLevel: 5 }
    const { container } = render(
      <TalentChip buildStore={build} talent={talent} onToggle={() => {}} onSetLevel={() => {}} />
    )
    expect(container.textContent).toContain('4')
  })
})
