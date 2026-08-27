import { fireEvent, render } from '@testing-library/react'
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

/** The <label> wrapping a named field. PrimeReact hangs `aria-label` on a
 * hidden input rather than the dropdown root, so the caption is the handle. */
function field(label: string): HTMLElement {
  const caption = [...document.querySelectorAll('label > span')].find((el) =>
    el.textContent?.trim().startsWith(label)
  )
  if (!caption?.parentElement) throw new Error(`no field labelled ${label}`)
  return caption.parentElement
}

/** Opens a field's dropdown and returns the labels of its panel's items. */
function openOptions(label: string) {
  fireEvent.click(field(label).querySelector('.p-dropdown') as HTMLElement)
  return [...document.querySelectorAll('.p-dropdown-item')].map((el) => el.textContent)
}

/** Picks an option from a field's dropdown. Scoped to the open panel, because
 * the selected label repeats the option text outside it. */
function pick(fieldLabel: string, optionLabel: string) {
  openOptions(fieldLabel)
  const item = [...document.querySelectorAll('.p-dropdown-item')].find(
    (el) => el.textContent === optionLabel
  )
  if (!item) throw new Error(`no option ${optionLabel} in ${fieldLabel}`)
  fireEvent.click(item)
}

/** The progression dropdown's current selection. */
function activeStage() {
  return field('Progression').querySelector('.p-dropdown-label')?.textContent
}

const preset = (id: string) => HOUSING_PRESETS.find((p) => p.id === id)!

describe('OptimizerConfigPanel progression presets', () => {
  it('offers the five stages, with no Custom entry while one is active', () => {
    panel(housingPresetPatch(preset('midGame'), skills))
    expect(openOptions('Progression')).toEqual([
      'Day 0',
      'Early Game',
      'Mid Game',
      'Late Game',
      'End Game',
    ])
  })

  it('shows the stage the constraints already match, without being picked', () => {
    panel(housingPresetPatch(preset('midGame'), skills))
    expect(activeStage()).toBe('Mid Game')
  })

  it('opens on End Game for the shipped defaults', () => {
    panel()
    expect(activeStage()).toBe('End Game')
  })

  it('applies tier, skills and power together when a stage is picked', () => {
    const { onChange } = panel()
    pick('Progression', 'Early Game')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      tier: 2,
      power: ['Heat', 'Mechanical'],
      skillIds: [UNSKILLED_SKILL_ID, 's-logging', 's-hunting', 's-carpentry', 's-masonry'],
    })
  })

  it('leaves the numeric assumptions alone when a stage is applied', () => {
    const { onChange } = panel({ residents: 4 })
    pick('Progression', 'Day 0')
    const patch = onChange.mock.calls[0][0] as Partial<OptimizerConfig>
    expect(patch).not.toHaveProperty('residents')
    expect(patch).not.toHaveProperty('maxFurnishingRepeats')
  })

  it('reveals a Custom entry once the constraints diverge from every stage', () => {
    panel({ ...housingPresetPatch(preset('midGame'), skills), tier: 4 })
    expect(activeStage()).toBe('Custom')
    expect(openOptions('Progression')).toContain('Custom')
  })

  it('ignores a pick of the Custom entry rather than emitting a patch', () => {
    // It only exists while already active, so there is nothing to apply.
    const { onChange } = panel({ ...housingPresetPatch(preset('midGame'), skills), tier: 4 })
    pick('Progression', 'Custom')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the stage active when a numeric assumption changes', () => {
    panel({ ...housingPresetPatch(preset('day0'), skills), residents: 4, maxRoomRepeat: 7 })
    expect(activeStage()).toBe('Day 0')
  })
})

describe('OptimizerConfigPanel layout', () => {
  it('names each wall material tier by the blocks it covers', () => {
    panel()
    expect(openOptions('Wall Material Tier')).toEqual([
      'Tier 0',
      'Tier 1 (Adobe)',
      'Tier 2 (Hewn Logs, Mortared Stone)',
      'Tier 3 (Lumber, Brick, Glass)',
      'Tier 4 (Steel, Concrete)',
      'Tier 5 (Ashlar Stone, Composite Lumber)',
    ])
  })

  it('stacks the assumptions in progression-then-pruning order', () => {
    panel()
    const labels = [...document.querySelectorAll('label > span')].map((el) =>
      el.textContent?.trim()
    )
    expect(labels).toEqual([
      'Progression',
      'Wall Material Tier',
      'Unlocked Skills',
      'Power Available',
      'Residents',
      'Max Copies Per Furnishing',
      'Min Furnishing Value',
      'Max Rooms Per Category',
      'Min Room Value',
    ])
  })

  it('explains every field from an info icon, the stage picker included', () => {
    panel()
    const tips = [...document.querySelectorAll('.optimizer-field-tip')].map((el) =>
      el.getAttribute('data-pr-tooltip')
    )
    expect(tips).toHaveLength(9)
    expect(tips[0]).toBe(
      'A convenience preset of common options. You can use this or alter any assumption however you wish.'
    )
    expect(tips[1]).toBe(
      'The construction block types available for building the rooms of the residence.'
    )
    expect(tips[8]).toBe(
      'The minimum value a room must contribute to the score to be included in the solution.'
    )
  })
})
