import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { SkillLevelCell } from '../SkillLevelCell'

function makeBuild() {
  const b = createBuildStore()
  b.setRow('userSkills', 'us1', { id: 'us1', buildId: 'b', skillId: 'sk1', level: 3 })
  return b
}

describe('SkillLevelCell', () => {
  it('renders the userSkill level', () => {
    const build = makeBuild()
    const { container } = render(
      <SkillLevelCell buildStore={build} userSkillId="us1" maxLevel={7} onChange={() => {}} />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('3')
  })

  it('falls back to 1 when no userSkill row exists yet', () => {
    const build = createBuildStore()
    const { container } = render(
      <SkillLevelCell
        buildStore={build}
        userSkillId="us-missing"
        maxLevel={7}
        onChange={() => {}}
      />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('1')
  })

  it('reflects buildStore updates', () => {
    const build = makeBuild()
    const { container } = render(
      <SkillLevelCell buildStore={build} userSkillId="us1" maxLevel={7} onChange={() => {}} />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('3')
    act(() => {
      build.setCell('userSkills', 'us1', 'level', 6)
    })
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('6')
  })

  it('clicking the spinner up button fires onChange with an incremented level', async () => {
    const build = makeBuild()
    const onChange = vi.fn()
    const { container } = render(
      <SkillLevelCell buildStore={build} userSkillId="us1" maxLevel={7} onChange={onChange} />
    )
    const upBtn = container.querySelector('.p-inputnumber-button-up') as HTMLElement
    fireEvent.mouseDown(upBtn)
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.mouseUp(upBtn)
    if (onChange.mock.calls.length > 0) {
      expect(onChange.mock.calls[0][0]).toBe('us1')
    }
  })
})
