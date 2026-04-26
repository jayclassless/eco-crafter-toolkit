import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CraftingTableIcon } from '../CraftingTableIcon'
import { EcoIcon } from '../EcoIcon'
import { ItemIcon } from '../ItemIcon'
import { PluginModuleIcon } from '../PluginModuleIcon'
import { RecipeIcon } from '../RecipeIcon'
import { SkillIcon } from '../SkillIcon'
import { TalentIcon } from '../TalentIcon'

describe('EcoIcon', () => {
  it('renders an item-category image based on the Item suffix', () => {
    const { container } = render(<EcoIcon name="WoodItem" size={32} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/eco-icons/items/WoodItem.png')
    expect(img.getAttribute('width')).toBe('32')
  })

  it('routes Skill suffix into the skills directory', () => {
    const { container } = render(<EcoIcon name="MiningSkill" />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/skills/MiningSkill.png'
    )
  })

  it('routes TalentGroup suffix into the talents directory', () => {
    const { container } = render(<EcoIcon name="PrecisionTalentGroup" />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/talents/PrecisionTalentGroup.png'
    )
  })

  it('falls back to misc when no recognized suffix', () => {
    const { container } = render(<EcoIcon name="Whatever" />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/eco-icons/misc/Whatever.png')
  })

  it('renders a fallback SVG when the image fails to load', () => {
    const { container } = render(<EcoIcon name="Missing" alt="missing icon" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg!.getAttribute('aria-label')).toBe('missing icon')
  })
})

describe('icon wrappers forward name + alt to EcoIcon', () => {
  it('SkillIcon uses skill.name as both src and alt fallback', () => {
    const { container } = render(<SkillIcon skill={{ name: 'MiningSkill' }} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/eco-icons/skills/MiningSkill.png')
    expect(img.getAttribute('alt')).toBe('MiningSkill')
  })

  it('ItemIcon uses item.name', () => {
    const { container } = render(<ItemIcon item={{ name: 'WoodItem' }} alt="Wood" />)
    expect(container.querySelector('img')!.getAttribute('alt')).toBe('Wood')
  })

  it('CraftingTableIcon uses table.name', () => {
    const { container } = render(<CraftingTableIcon table={{ name: 'WorkbenchItem' }} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/items/WorkbenchItem.png'
    )
  })

  it('PluginModuleIcon uses module.name', () => {
    const { container } = render(<PluginModuleIcon module={{ name: 'BasicUpgradeItem' }} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/items/BasicUpgradeItem.png'
    )
  })

  it('RecipeIcon uses primaryProduct.name', () => {
    const { container } = render(<RecipeIcon primaryProduct={{ name: 'PlankItem' }} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/items/PlankItem.png'
    )
  })

  it('TalentIcon uses talent.talentGroupName', () => {
    const { container } = render(
      <TalentIcon talent={{ talentGroupName: 'PrecisionTalentGroup' }} />
    )
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/eco-icons/talents/PrecisionTalentGroup.png'
    )
  })
})
