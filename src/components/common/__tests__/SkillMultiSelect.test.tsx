import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OTHER_PROFESSION, type SkillSelectOption, UNSKILLED_SKILL_ID } from '@/lib/skill-options'

import { SkillMultiSelect } from '../SkillMultiSelect'

import '@/i18n'

// In `collectSkillOptions` order: by name, with the synthetic entry last.
const options: SkillSelectOption[] = [
  {
    id: 's-carpentry',
    name: 'Carpentry',
    rawName: 'CarpentrySkill',
    professionRawName: 'CarpenterSkill',
    professionName: 'Carpenter',
    count: 12,
  },
  {
    id: 's-masonry',
    name: 'Masonry',
    rawName: 'MasonrySkill',
    professionRawName: 'MasonSkill',
    professionName: 'Mason',
    count: 8,
  },
  {
    id: UNSKILLED_SKILL_ID,
    name: 'Unskilled',
    rawName: '',
    professionRawName: OTHER_PROFESSION,
    professionName: 'Other',
    count: 4,
  },
]

function open(value: string[] | null = null, onChange = vi.fn()) {
  const result = render(
    <SkillMultiSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Skills"
      ariaLabel="Skills"
    />
  )
  fireEvent.click(result.container.querySelector('.p-multiselect') as HTMLElement)
  return { ...result, onChange }
}

describe('SkillMultiSelect', () => {
  it('groups the options by profession, with the Unskilled bucket last', () => {
    open()
    const headers = [...document.querySelectorAll('.p-multiselect-item-group')].map(
      (el) => el.textContent
    )
    expect(headers).toEqual(['Carpenter', 'Mason', 'Other'])
  })

  it('shows each skill with its icon and how many items it unlocks', () => {
    open()
    expect(screen.getByText('Carpentry (12)')).toBeInTheDocument()
    const icon = document.querySelector(
      'img[src="/eco-icons/skills/CarpentrySkill.png"]'
    ) as HTMLImageElement
    expect(icon).not.toBeNull()
  })

  it('offers the synthetic Unskilled entry, which has no sprite of its own', () => {
    open()
    expect(screen.getByText('Unskilled (4)')).toBeInTheDocument()
    expect(document.querySelector('img[src*="/eco-icons/skills/.png"]')).toBeNull()
    expect(document.querySelector('.pi-ban')).not.toBeNull()
  })

  it('treats a null value as everything selected', () => {
    open(null)
    const items = [...document.querySelectorAll('.p-multiselect-item')]
    expect(items).toHaveLength(options.length)
    expect(items.every((el) => el.getAttribute('aria-selected') === 'true')).toBe(true)
  })

  it('treats an empty array as nothing selected — the opposite of null', () => {
    open([])
    const items = [...document.querySelectorAll('.p-multiselect-item')]
    expect(items.some((el) => el.getAttribute('aria-selected') === 'true')).toBe(false)
  })

  it('reports a deselection as the remaining ids', () => {
    const { onChange } = open()
    fireEvent.click(screen.getByText('Carpentry (12)'))
    expect(onChange).toHaveBeenCalledWith(['s-masonry', UNSKILLED_SKILL_ID])
  })

  it('normalizes a full selection back to null, so it cannot pin stale ids', () => {
    const onChange = vi.fn()
    open(['s-masonry', UNSKILLED_SKILL_ID], onChange)
    fireEvent.click(screen.getByText('Carpentry (12)'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
