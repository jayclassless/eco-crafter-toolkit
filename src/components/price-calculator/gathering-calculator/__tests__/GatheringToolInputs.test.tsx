import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { localeProvider } from '@/i18n/__tests__/locale-provider'

import type { GatheringClothingOption, GatheringToolOption } from '../gathering-data'
import { GatheringToolInputs } from '../GatheringToolInputs'

import '@/i18n'

function toolOption(
  itemId: string,
  rawName: string,
  tier: number,
  kind = 'Pickaxe'
): GatheringToolOption {
  return {
    itemId,
    name: rawName,
    rawName,
    kind,
    tier,
    tool: { kind, baseCalories: 20, baseDamage: tier, damageUsesToolCurve: false },
    calorieSkillId: 'sk-mine',
    efficiencyTalentId: '',
    strengthTalentId: '',
  }
}

const TOOLS = [
  toolOption('it-stone', 'StonePickaxeItem', 1),
  toolOption('it-steel', 'SteelPickaxeItem', 3),
]

const CLOTHING: GatheringClothingOption[] = [
  { itemId: 'it-boots', name: 'BuilderBootsItem', rawName: 'BuilderBootsItem', calorieRate: -0.3 },
  { itemId: 'it-pack', name: 'WorkBackpackItem', rawName: 'WorkBackpackItem', calorieRate: -0.1 },
]

function renderInputs(overrides: Partial<Parameters<typeof GatheringToolInputs>[0]> = {}) {
  const props = {
    tools: TOOLS,
    selectedToolId: 'it-stone',
    onSelectTool: vi.fn(),
    skillName: 'MiningSkill',
    skillLevel: 0,
    onSkillLevel: vi.fn(),
    clothing: CLOTHING,
    selectedClothingIds: [] as string[],
    onSelectClothing: vi.fn(),
    clothingMultiplier: 1,
    ...overrides,
  }
  return { props, ...render(<GatheringToolInputs {...props} />) }
}

describe('GatheringToolInputs', () => {
  it('renders the tool with its icon and the skill spinner', () => {
    const { container } = renderInputs()
    expect(screen.getByText('Tool')).toBeTruthy()
    expect(screen.getByText('MiningSkill')).toBeTruthy()
    // valueTemplate draws the selected tool's icon from its raw name.
    expect(container.querySelector('img')?.getAttribute('src')).toContain('StonePickaxe')
  })

  it('hides the skill spinner when the tool has no calorie skill', () => {
    renderInputs({ skillName: '' })
    expect(screen.queryByText('MiningSkill')).toBeNull()
  })

  it('disables the tool picker when nothing can gather the target', () => {
    const { container } = renderInputs({ tools: [], selectedToolId: '' })
    expect(container.querySelector('.p-dropdown-label')?.textContent).toBe('No tool available')
    expect(container.querySelector('.p-disabled')).toBeTruthy()
  })

  it('reports a tool change by item id', async () => {
    const { props, container } = renderInputs()
    fireEvent.click(container.querySelector('.p-dropdown') as HTMLElement)
    const option = await waitFor(() => {
      const found = [...document.body.querySelectorAll('.p-dropdown-item')].find((el) =>
        /SteelPickaxe/.test(el.textContent ?? '')
      )
      expect(found).toBeTruthy()
      return found!
    })
    fireEvent.click(option)
    expect(props.onSelectTool).toHaveBeenCalledWith('it-steel')
  })

  it('shows each clothing option with its calorie rate', async () => {
    const { container } = renderInputs()
    fireEvent.click(container.querySelector('.p-multiselect') as HTMLElement)
    await waitFor(() => {
      const items = [...document.body.querySelectorAll('.p-multiselect-item')].map(
        (el) => el.textContent
      )
      expect(items.some((x) => x?.includes('-30%'))).toBe(true)
      expect(items.some((x) => x?.includes('-10%'))).toBe(true)
    })
  })

  it('reports a clothing selection', async () => {
    const { props, container } = renderInputs()
    fireEvent.click(container.querySelector('.p-multiselect') as HTMLElement)
    const option = await waitFor(() => {
      const found = [...document.body.querySelectorAll('.p-multiselect-item')].find((el) =>
        /BuilderBoots/.test(el.textContent ?? '')
      )
      expect(found).toBeTruthy()
      return found!
    })
    fireEvent.click(option)
    expect(props.onSelectClothing).toHaveBeenCalledWith(['it-boots'])
  })

  it('spells out the stacked clothing multiplier', () => {
    // Boots and the backpack sit in different slots, so their rates stack —
    // showing the result is what makes that visible.
    renderInputs({ selectedClothingIds: ['it-boots', 'it-pack'], clothingMultiplier: 0.6 })
    expect(screen.getByText('60% calorie cost')).toBeTruthy()
  })

  it('formats the multiplier percent for the active locale', () => {
    // fr-FR separates the number from the sign with a non-breaking space.
    render(
      <GatheringToolInputs
        tools={TOOLS}
        selectedToolId="it-stone"
        onSelectTool={vi.fn()}
        skillName="MiningSkill"
        skillLevel={0}
        onSkillLevel={vi.fn()}
        clothing={CLOTHING}
        selectedClothingIds={['it-boots', 'it-pack']}
        onSelectClothing={vi.fn()}
        clothingMultiplier={0.6}
      />,
      { wrapper: localeProvider('fr-FR') }
    )
    expect(screen.getByText(/^60\s%\scalorie cost$/u)).toBeTruthy()
  })
})
