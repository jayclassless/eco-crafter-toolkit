import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePriceSignal, type PriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'

import { ItemCostCell } from '../ItemCostCell'
import { ItemSaleCell } from '../ItemSaleCell'
import { MarginCell, MarginOptionsContext } from '../MarginCell'
import { MirrorChildCheckbox } from '../MirrorChildCheckbox'
import { ProductItemName } from '../ProductItemName'
import { RecipeCostCell } from '../RecipeCostCell'
import { RecipeFavoriteStar } from '../RecipeFavoriteStar'

let signal: PriceSignal
let build: ReturnType<typeof createBuildStore>

beforeEach(() => {
  const { result } = renderHook(() => usePriceSignal())
  signal = result.current
  build = createBuildStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ItemCostCell / ItemSaleCell', () => {
  it('renders a dash when no price is set', () => {
    const { container } = render(<ItemCostCell signal={signal} itemId="iron" />)
    expect(container.textContent).toBe('-')
  })

  it('renders the formatted cost price for the item', () => {
    act(() => signal.set({ iron: { costPrice: 12.5, salePrice: 20 } }))
    const { container } = render(<ItemCostCell signal={signal} itemId="iron" />)
    expect(container.textContent).toBe('12.50')
  })

  it('renders the formatted sale price', () => {
    act(() => signal.set({ iron: { costPrice: 12.5, salePrice: 20 } }))
    const { container } = render(<ItemSaleCell signal={signal} itemId="iron" />)
    expect(container.textContent).toBe('20.00')
  })

  it('updates when the signal pushes a new value for that id', () => {
    const { container } = render(<ItemCostCell signal={signal} itemId="iron" />)
    expect(container.textContent).toBe('-')
    act(() => signal.set({ iron: { costPrice: 9, salePrice: 11 } }))
    expect(container.textContent).toBe('9.00')
  })
})

describe('RecipeCostCell', () => {
  it('renders the recipe-keyed cost price', () => {
    act(() => signal.setRecipe({ 'r1::iron': { costPrice: 7, salePrice: 9 } }))
    const { container } = render(<RecipeCostCell signal={signal} recipeId="r1::iron" />)
    expect(container.textContent).toBe('7.00')
  })

  it('renders a dash when the recipe has no entry', () => {
    const { container } = render(<RecipeCostCell signal={signal} recipeId="absent" />)
    expect(container.textContent).toBe('-')
  })
})

describe('MarginCell', () => {
  const margins = [
    { id: 'm1', name: 'Standard', percent: 20, isDefault: true },
    { id: 'm2', name: 'Premium', percent: 50, isDefault: false },
  ]

  const wrap = (ui: React.ReactNode, defaultMarginId = 'm1') => (
    <MarginOptionsContext.Provider value={{ options: margins, defaultMarginId }}>
      {ui}
    </MarginOptionsContext.Provider>
  )

  it('renders all margin options plus an empty option', () => {
    const { container } = render(wrap(<MarginCell value="m1" rowId="row-1" onChange={() => {}} />))
    const opts = container.querySelectorAll('option')
    expect(opts).toHaveLength(3)
    expect((opts[0] as HTMLOptionElement).value).toBe('')
  })

  it('falls back to the default margin id when value is empty', () => {
    const { container } = render(wrap(<MarginCell value="" rowId="row-1" onChange={() => {}} />))
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('m1')
  })

  it('fires onChange with the rowId and selected margin id', () => {
    const onChange = vi.fn()
    const { container } = render(wrap(<MarginCell value="m1" rowId="row-1" onChange={onChange} />))
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'm2' } })
    expect(onChange).toHaveBeenCalledWith('row-1', 'm2')
  })
})

describe('MirrorChildCheckbox', () => {
  it('renders nothing when the parent priceMode is not mirror', () => {
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: 'parent',
      priceMode: 'min',
    })
    const { container } = render(
      <MirrorChildCheckbox
        parentProductId="parent"
        parentUserPriceId="up1"
        childRecipeId="recipe-a"
        buildStore={build}
        onSelect={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders an unchecked box when mode=mirror but primary is a different recipe', () => {
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: 'parent',
      priceMode: 'mirror',
      primaryItemId: 'recipe-b',
    })
    const { container } = render(
      <MirrorChildCheckbox
        parentProductId="parent"
        parentUserPriceId="up1"
        childRecipeId="recipe-a"
        buildStore={build}
        onSelect={() => {}}
      />
    )
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(cb.checked).toBe(false)
  })

  it('checks the box when primary matches the child recipe', () => {
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: 'parent',
      priceMode: 'mirror',
      primaryItemId: 'recipe-a',
    })
    const { container } = render(
      <MirrorChildCheckbox
        parentProductId="parent"
        parentUserPriceId="up1"
        childRecipeId="recipe-a"
        buildStore={build}
        onSelect={() => {}}
      />
    )
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })

  it('fires onSelect with the parent + child ids when toggled', () => {
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: 'parent',
      priceMode: 'mirror',
      primaryItemId: 'recipe-b',
    })
    const onSelect = vi.fn()
    const { container } = render(
      <MirrorChildCheckbox
        parentProductId="parent"
        parentUserPriceId="up1"
        childRecipeId="recipe-a"
        buildStore={build}
        onSelect={onSelect}
      />
    )
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(cb)
    expect(onSelect).toHaveBeenCalledWith('parent', 'recipe-a', 'up1')
  })
})

describe('RecipeFavoriteStar', () => {
  beforeEach(() => {
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: 'b1',
      recipeId: 'r1',
      favorite: false,
    })
  })

  it('renders an empty star when favorite is false', () => {
    const { container } = render(
      <RecipeFavoriteStar buildStore={build} userRecipeId="ur1" onToggle={() => {}} />
    )
    expect(container.querySelector('.pi-star')).toBeInTheDocument()
    expect(container.querySelector('.pi-star-fill')).toBeNull()
  })

  it('renders a filled star when favorite is true', () => {
    build.setCell('userRecipes', 'ur1', 'favorite', true)
    const { container } = render(
      <RecipeFavoriteStar buildStore={build} userRecipeId="ur1" onToggle={() => {}} />
    )
    expect(container.querySelector('.pi-star-fill')).toBeInTheDocument()
  })

  it('fires onToggle with the inverted state', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <RecipeFavoriteStar buildStore={build} userRecipeId="ur1" onToggle={onToggle} />
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledWith('ur1', true)
  })
})

describe('ProductItemName', () => {
  beforeEach(() => {
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: 'iron',
      priceMode: 'min',
    })
  })

  it('renders a non-clickable name when cost is null', () => {
    const { container } = render(
      <ProductItemName
        itemId="iron"
        displayName="Iron"
        rawName="IronItem"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onOpenRecipe={() => {}}
      />
    )
    // No PrimeReact link button → just a span.
    expect(container.querySelector('button')).toBeNull()
    expect(screen.getByText('Iron')).toBeInTheDocument()
  })

  it('renders a non-clickable name when mode=avg even with a price', () => {
    build.setCell('userPrices', 'up1', 'priceMode', 'avg')
    act(() => signal.set({ iron: { costPrice: 5, salePrice: 7, recipeId: 'r1' } }))
    const { container } = render(
      <ProductItemName
        itemId="iron"
        displayName="Iron"
        rawName="IronItem"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onOpenRecipe={() => {}}
      />
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders a button and routes onClick to the winning recipe', () => {
    act(() => signal.set({ iron: { costPrice: 5, salePrice: 7, recipeId: 'r-winner' } }))
    const onOpenRecipe = vi.fn()
    const { container } = render(
      <ProductItemName
        itemId="iron"
        displayName="Iron"
        rawName="IronItem"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onOpenRecipe={onOpenRecipe}
      />
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onOpenRecipe).toHaveBeenCalledWith('r-winner')
  })

  it('renders bold text when bold prop is set', () => {
    act(() => signal.set({ iron: { costPrice: 5, salePrice: 7, recipeId: 'r1' } }))
    const { container } = render(
      <ProductItemName
        itemId="iron"
        displayName="Iron"
        rawName="IronItem"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onOpenRecipe={() => {}}
        bold
      />
    )
    const btn = container.querySelector('button.font-bold')
    expect(btn).not.toBeNull()
  })

  it('does nothing on click when there is no winning recipeId', () => {
    act(() => signal.set({ iron: { costPrice: 5, salePrice: 7 } }))
    const onOpenRecipe = vi.fn()
    const { container } = render(
      <ProductItemName
        itemId="iron"
        displayName="Iron"
        rawName="IronItem"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onOpenRecipe={onOpenRecipe}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    expect(onOpenRecipe).not.toHaveBeenCalled()
  })
})
