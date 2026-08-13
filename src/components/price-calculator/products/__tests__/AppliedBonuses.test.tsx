import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { localeProvider } from '@/i18n/__tests__/locale-provider'
import type { AppliedBonus } from '@/lib/recipe-modifiers'

import { AppliedBonuses } from '../AppliedBonuses'

import '@/i18n'

const skillBonus: AppliedBonus = {
  source: 'skill',
  icon: { kind: 'skill', rawName: 'MiningSkill' },
  displayName: 'Mining (Level 4)',
  effects: [
    { metric: 'labor', signedPercent: -10 },
    { metric: 'craftTime', signedPercent: -5 },
  ],
}

const talentBonus: AppliedBonus = {
  source: 'talent',
  icon: { kind: 'talent', talentGroupName: 'PrecisionTalentGroup' },
  displayName: 'Sharp',
  effects: [{ metric: 'ingredients', signedPercent: -20 }],
}

const moduleBonus: AppliedBonus = {
  source: 'module',
  icon: { kind: 'module', rawName: 'BasicUpgradeItem' },
  displayName: 'Basic Upgrade',
  effects: [{ metric: 'products', signedPercent: 25 }],
}

describe('AppliedBonuses', () => {
  it('renders nothing when bonuses is empty', () => {
    const { container } = render(<AppliedBonuses bonuses={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one entry per bonus with the display name', () => {
    const { container } = render(
      <AppliedBonuses bonuses={[skillBonus, talentBonus, moduleBonus]} />
    )
    const items = container.querySelectorAll('ul.list-none > li')
    expect(items).toHaveLength(3)
    const text = container.textContent ?? ''
    expect(text).toContain('Mining (Level 4)')
    expect(text).toContain('Sharp')
    expect(text).toContain('Basic Upgrade')
  })

  it('formats positive percents with a leading "+"', () => {
    const { container } = render(<AppliedBonuses bonuses={[moduleBonus]} />)
    expect(container.textContent).toContain('+25%')
  })

  it('renders negative percents without a leading "+"', () => {
    const { container } = render(<AppliedBonuses bonuses={[skillBonus]} />)
    expect(container.textContent).toContain('-10%')
    expect(container.textContent).toContain('-5%')
  })

  it('renders the percent and the metric as one catalog phrase', () => {
    const { container } = render(<AppliedBonuses bonuses={[skillBonus]} />)
    const effects = [...container.querySelectorAll('li > ul > li')].map((el) => el.textContent)
    expect(effects).toEqual(['-10% labor', '-5% craft time'])
  })

  it('places the percent sign per locale rather than in JS', () => {
    // Turkish prefixes the sign; the old `${percent}% ${metric}` template could
    // not express that, and neither could a translator.
    const { container } = render(<AppliedBonuses bonuses={[skillBonus]} />, {
      wrapper: localeProvider('tr'),
    })
    const effects = [...container.querySelectorAll('li > ul > li')].map((el) => el.textContent)
    expect(effects).toEqual(['-%10 labor', '-%5 craft time'])
  })

  it('renders the appropriate icon kind for each bonus source', () => {
    const { container } = render(
      <AppliedBonuses bonuses={[skillBonus, talentBonus, moduleBonus]} />
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(3)
    expect(imgs[0].getAttribute('src')).toContain('/skills/MiningSkill')
    expect(imgs[1].getAttribute('src')).toContain('/talents/PrecisionTalentGroup')
    expect(imgs[2].getAttribute('src')).toContain('/items/BasicUpgradeItem')
  })
})
