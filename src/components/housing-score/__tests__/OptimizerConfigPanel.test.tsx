import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OTHER_PROFESSION, type SkillSelectOption, UNSKILLED_SKILL_ID } from '@/lib/skill-options'
import type { RoomTier } from '@/types/game-data'

import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '../housing-optimizer-types'
import { housingPresetPatch, HOUSING_PRESETS } from '../housing-presets'
import { OptimizerConfigPanel } from '../OptimizerConfigPanel'

import '@/i18n'

function option(id: string, rawName: string, name: string): SkillSelectOption {
  return {
    id,
    name,
    rawName,
    professionRawName: rawName ? 'CarpenterSkill' : OTHER_PROFESSION,
    professionName: rawName ? 'Carpenter' : 'Other',
    count: 1,
  }
}

const skills: SkillSelectOption[] = [
  option(UNSKILLED_SKILL_ID, '', 'Unskilled'),
  option('s-logging', 'LoggingSkill', 'Logging'),
  option('s-hunting', 'HuntingSkill', 'Hunting'),
  option('s-carpentry', 'CarpentrySkill', 'Carpentry'),
  option('s-masonry', 'MasonrySkill', 'Masonry'),
  option('s-electronics', 'ElectronicsSkill', 'Electronics'),
]

const tiers: RoomTier[] = [0, 1, 2, 3, 4, 5].map((tierVal) => ({
  id: `t${tierVal}`,
  datasetId: 'd1',
  tierVal,
  softCap: tierVal * 5,
  hardCap: tierVal * 10,
  diminishingReturnPercent: 0.65,
}))

function panel(config: Partial<OptimizerConfig> = {}) {
  const onChange = vi.fn()
  render(
    <OptimizerConfigPanel
      config={{ ...DEFAULT_OPTIMIZER_CONFIG, ...config }}
      skills={skills}
      tiers={tiers}
      onChange={onChange}
    />
  )
  return { onChange }
}

/** The label of every rendered progression segment, in order. */
function segments() {
  return [...document.querySelectorAll('.p-selectbutton .p-button')].map((el) => el.textContent)
}

function activeSegment() {
  return document.querySelector('.p-selectbutton .p-button.p-highlight')?.textContent
}

const preset = (id: string) => HOUSING_PRESETS.find((p) => p.id === id)!

describe('OptimizerConfigPanel progression presets', () => {
  it('offers the five stages, with no Custom segment while one is active', () => {
    panel(housingPresetPatch(preset('midGame'), skills))
    expect(segments()).toEqual(['Day 0', 'Early Game', 'Mid Game', 'Late Game', 'End Game'])
  })

  it('shows the stage the constraints already match, without being clicked', () => {
    panel(housingPresetPatch(preset('midGame'), skills))
    expect(activeSegment()).toBe('Mid Game')
  })

  it('opens on End Game for the shipped defaults', () => {
    panel()
    expect(activeSegment()).toBe('End Game')
  })

  it('applies tier, skills and power together when a stage is clicked', () => {
    const { onChange } = panel()
    fireEvent.click(screen.getByText('Early Game'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      tier: 2,
      power: ['Heat', 'Mechanical'],
      skillIds: [UNSKILLED_SKILL_ID, 's-logging', 's-hunting', 's-carpentry', 's-masonry'],
    })
  })

  it('leaves the numeric assumptions alone when a stage is applied', () => {
    const { onChange } = panel({ residents: 4 })
    fireEvent.click(screen.getByText('Day 0'))
    const patch = onChange.mock.calls[0][0] as Partial<OptimizerConfig>
    expect(patch).not.toHaveProperty('residents')
    expect(patch).not.toHaveProperty('maxFurnishingRepeats')
  })

  it('reveals a Custom segment once the constraints diverge from every stage', () => {
    panel({ ...housingPresetPatch(preset('midGame'), skills), tier: 4 })
    expect(segments()).toEqual([
      'Day 0',
      'Early Game',
      'Mid Game',
      'Late Game',
      'End Game',
      'Custom',
    ])
    expect(activeSegment()).toBe('Custom')
  })

  it('ignores a click on the Custom segment rather than emitting a patch', () => {
    // It only exists while already active, so there is nothing to apply.
    const { onChange } = panel({ ...housingPresetPatch(preset('midGame'), skills), tier: 4 })
    fireEvent.click(screen.getByText('Custom'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the stage active when a numeric assumption changes', () => {
    panel({ ...housingPresetPatch(preset('day0'), skills), residents: 4, maxRoomRepeat: 7 })
    expect(activeSegment()).toBe('Day 0')
  })
})
