import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { ParentFavoriteStar } from '../ParentFavoriteStar'

import '@/i18n'

function makeBuild(favorites: boolean[]) {
  const b = createBuildStore()
  favorites.forEach((fav, i) => {
    b.setRow('userRecipes', `ur${i}`, {
      id: `ur${i}`,
      buildId: 'b',
      recipeId: `r${i}`,
      favorite: fav,
    })
  })
  return b
}

describe('ParentFavoriteStar', () => {
  it('renders an empty star at low opacity when no children are favorited', () => {
    const build = makeBuild([false, false])
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={() => {}}
      />
    )
    expect(container.querySelector('.pi-star')).toBeInTheDocument()
    expect(container.querySelector('.pi-star-fill')).toBeNull()
    expect((container.querySelector('button') as HTMLButtonElement).style.opacity).toBe('0.4')
  })

  it('renders a filled star at half opacity when some are favorited', () => {
    const build = makeBuild([true, false])
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={() => {}}
      />
    )
    expect(container.querySelector('.pi-star-fill')).toBeInTheDocument()
    expect((container.querySelector('button') as HTMLButtonElement).style.opacity).toBe('0.5')
  })

  it('renders a filled star with no opacity override when all are favorited', () => {
    const build = makeBuild([true, true])
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={() => {}}
      />
    )
    expect(container.querySelector('.pi-star-fill')).toBeInTheDocument()
    expect((container.querySelector('button') as HTMLButtonElement).style.opacity).toBe('')
  })

  it('clicking when none are favorited calls onToggleAll(true)', () => {
    const build = makeBuild([false, false])
    const onToggleAll = vi.fn()
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={onToggleAll}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    expect(onToggleAll).toHaveBeenCalledWith(['ur0', 'ur1'], true)
  })

  it('clicking when all are favorited calls onToggleAll(false)', () => {
    const build = makeBuild([true, true])
    const onToggleAll = vi.fn()
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={onToggleAll}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    expect(onToggleAll).toHaveBeenCalledWith(['ur0', 'ur1'], false)
  })

  it('updates aggregate when a child favorite cell changes', () => {
    const build = makeBuild([false, false])
    const { container } = render(
      <ParentFavoriteStar
        buildStore={build}
        childUserRecipeIds={['ur0', 'ur1']}
        onToggleAll={() => {}}
      />
    )
    expect(container.querySelector('.pi-star-fill')).toBeNull()
    act(() => build.setCell('userRecipes', 'ur0', 'favorite', true))
    expect(container.querySelector('.pi-star-fill')).toBeInTheDocument()
  })
})
