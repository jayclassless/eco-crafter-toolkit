import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { RecipeCostBreakdown } from '@/types/solver'

interface PriceEntry {
  costPrice: number
  salePrice: number
  /**
   * For multi-recipe products, the recipe that won the active mode's
   * selection (min/max/mirror). '' for avg and for items that don't come
   * from a recipe (tags, seeded overrides). Used by the Products panel to
   * route the parent name click to the right RecipeDialog.
   */
  recipeId?: string
}

export type PricesMap = Record<string, PriceEntry>
export type RecipeCostsMap = Record<string, RecipeCostBreakdown>

/**
 * External store holding the latest computed prices. Cells subscribe through
 * `useSyncExternalStore` and only re-render when their *own* price changes —
 * the enclosing Products table never re-renders just because the solver
 * produced new prices, because the signal object reference is stable.
 *
 * This is the crux of the "don't re-render the 148-row DataTable on every
 * solver result" optimization.
 *
 * Two independent namespaces: item-keyed prices (product/tag/ingredient) and
 * recipe-keyed prices (per-userRecipe cost/sale for multi-recipe children).
 */
export interface PriceSignal {
  /** Replace all three namespaces at once and notify changed cells. Fires
   * `subscribeAny` listeners exactly once for the whole update, so consumers
   * like `usePriceSignalRevision` don't see three separate React commits per
   * solver result. Prefer this over calling `set`/`setRecipe`/`setRecipeCosts`
   * in sequence. */
  setAll(prices: PricesMap, recipePrices: PricesMap, recipeCosts: RecipeCostsMap): void
  /** Replace the item-keyed prices map and notify only cells whose price changed. */
  set(prices: PricesMap): void
  /** Replace the recipe-keyed prices map and notify only cells whose price changed. */
  setRecipe(prices: PricesMap): void
  /** Subscribe to changes for a specific item/field. Returns an unsubscribe fn. */
  subscribe(itemId: string, field: 'costPrice' | 'salePrice', listener: () => void): () => void
  /** Subscribe to changes for a specific recipe/field. */
  subscribeRecipe(
    recipeId: string,
    field: 'costPrice' | 'salePrice',
    listener: () => void
  ): () => void
  /** Snapshot read used by useSyncExternalStore. Returns a stable number|null. */
  get(itemId: string, field: 'costPrice' | 'salePrice'): number | null
  /** Recipe-keyed snapshot read. */
  getRecipe(recipeId: string, field: 'costPrice' | 'salePrice'): number | null
  /** Winning recipeId for an item (set via `.set` from solver output). '' or null when n/a. */
  getRecipeIdFor(itemId: string): string
  /** Return the full item-keyed prices map (snapshot, not a copy). */
  getAll(): PricesMap
  /** Replace the per-recipe cost breakdown map and notify listeners whose breakdown changed. */
  setRecipeCosts(costs: RecipeCostsMap): void
  /** Subscribe to any field change within a recipe's cost breakdown. */
  subscribeRecipeCost(recipeId: string, listener: () => void): () => void
  /** Snapshot read for a recipe's cost breakdown. Returns a stable reference when unchanged. */
  getRecipeCost(recipeId: string): RecipeCostBreakdown | null
  /** Subscribe to any solver update across all namespaces. Useful for dialogs
   * that need to re-render whenever prices change without subscribing to each
   * cell individually. */
  subscribeAny(listener: () => void): () => void
}

function notifyChangedCells(
  listeners: Map<string, Set<() => void>>,
  prev: PricesMap,
  next: PricesMap
) {
  for (const [key, set] of listeners) {
    const pipe = key.indexOf('|')
    const id = key.slice(0, pipe)
    const field = key.slice(pipe + 1) as 'costPrice' | 'salePrice'
    const nextEntry = next[id]
    const prevEntry = prev[id]
    const nextVal = nextEntry ? nextEntry[field] : null
    const prevVal = prevEntry ? prevEntry[field] : null
    if (nextVal !== prevVal) {
      for (const listener of set) listener()
    }
  }
}

function addListener(
  listeners: Map<string, Set<() => void>>,
  id: string,
  field: 'costPrice' | 'salePrice',
  listener: () => void
): () => void {
  const key = `${id}|${field}`
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    const s = listeners.get(key)
    if (!s) return
    s.delete(listener)
    if (s.size === 0) listeners.delete(key)
  }
}

function breakdownEqual(
  a: RecipeCostBreakdown | undefined,
  b: RecipeCostBreakdown | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.craftTime === b.craftTime &&
    a.craftTimeCost === b.craftTimeCost &&
    a.laborAmount === b.laborAmount &&
    a.laborCost === b.laborCost &&
    a.costPerMinute === b.costPerMinute &&
    a.calorieCost === b.calorieCost
  )
}

function createPriceSignal(): PriceSignal {
  let itemPrices: PricesMap = {}
  let recipePrices: PricesMap = {}
  let recipeCosts: RecipeCostsMap = {}
  const itemListeners = new Map<string, Set<() => void>>()
  const recipeListeners = new Map<string, Set<() => void>>()
  const recipeCostListeners = new Map<string, Set<() => void>>()
  const anyListeners = new Set<() => void>()

  const notifyAny = () => {
    for (const listener of anyListeners) listener()
  }

  const notifyRecipeCostListeners = (prev: RecipeCostsMap, next: RecipeCostsMap) => {
    for (const [recipeId, set] of recipeCostListeners) {
      if (!breakdownEqual(prev[recipeId], next[recipeId])) {
        for (const listener of set) listener()
      }
    }
  }

  return {
    setAll(prices, rPrices, rCosts) {
      const prevItem = itemPrices
      const prevRecipe = recipePrices
      const prevCosts = recipeCosts
      itemPrices = prices
      recipePrices = rPrices
      recipeCosts = rCosts
      notifyChangedCells(itemListeners, prevItem, prices)
      notifyChangedCells(recipeListeners, prevRecipe, rPrices)
      notifyRecipeCostListeners(prevCosts, rCosts)
      notifyAny()
    },
    set(prices) {
      const prev = itemPrices
      itemPrices = prices
      notifyChangedCells(itemListeners, prev, prices)
      notifyAny()
    },
    setRecipe(prices) {
      const prev = recipePrices
      recipePrices = prices
      notifyChangedCells(recipeListeners, prev, prices)
      notifyAny()
    },
    setRecipeCosts(costs) {
      const prev = recipeCosts
      recipeCosts = costs
      notifyRecipeCostListeners(prev, costs)
      notifyAny()
    },
    subscribe(itemId, field, listener) {
      return addListener(itemListeners, itemId, field, listener)
    },
    subscribeRecipe(recipeId, field, listener) {
      return addListener(recipeListeners, recipeId, field, listener)
    },
    subscribeRecipeCost(recipeId, listener) {
      let set = recipeCostListeners.get(recipeId)
      if (!set) {
        set = new Set()
        recipeCostListeners.set(recipeId, set)
      }
      set.add(listener)
      return () => {
        const s = recipeCostListeners.get(recipeId)
        if (!s) return
        s.delete(listener)
        if (s.size === 0) recipeCostListeners.delete(recipeId)
      }
    },
    get(itemId, field) {
      const entry = itemPrices[itemId]
      return entry ? entry[field] : null
    },
    getRecipe(recipeId, field) {
      const entry = recipePrices[recipeId]
      return entry ? entry[field] : null
    },
    getRecipeCost(recipeId) {
      return recipeCosts[recipeId] ?? null
    },
    getRecipeIdFor(itemId) {
      const entry = itemPrices[itemId]
      return entry?.recipeId ?? ''
    },
    getAll() {
      return itemPrices
    },
    subscribeAny(listener) {
      anyListeners.add(listener)
      return () => {
        anyListeners.delete(listener)
      }
    },
  }
}

/**
 * Hook that owns a stable `PriceSignal` for the lifetime of the component.
 * Callers push new prices via `signal.set(...)` from an effect.
 */
export function usePriceSignal(): PriceSignal {
  // Lazy initializer runs exactly once; the setter is never called, so the
  // returned signal is stable for the component's lifetime.
  const [signal] = useState(createPriceSignal)
  return signal
}

/**
 * Subscribe to a single price cell. Returns a scalar; React bails out of a
 * re-render when the scalar is strictly equal to the previous snapshot.
 */
export function usePriceCell(
  signal: PriceSignal,
  itemId: string | null | undefined,
  field: 'costPrice' | 'salePrice'
): number | null {
  // Memoize subscribe/getSnapshot per (signal, itemId, field). useSyncExternalStore
  // re-subscribes if the subscribe identity changes, so stability matters.
  const { subscribe, getSnapshot } = useMemo(() => {
    if (!itemId) {
      return {
        subscribe: () => () => {},
        getSnapshot: () => null as number | null,
      }
    }
    return {
      subscribe: (listener: () => void) => signal.subscribe(itemId, field, listener),
      getSnapshot: () => signal.get(itemId, field),
    }
  }, [signal, itemId, field])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Subscribe to a single recipe-keyed price cell, independent of item-keyed
 * prices. Used by multi-recipe product children that need to show their own
 * producer's cost/sale rather than the aggregated product price.
 */
export function useRecipePriceCell(
  signal: PriceSignal,
  recipeId: string | null | undefined,
  field: 'costPrice' | 'salePrice'
): number | null {
  const { subscribe, getSnapshot } = useMemo(() => {
    if (!recipeId) {
      return {
        subscribe: () => () => {},
        getSnapshot: () => null as number | null,
      }
    }
    return {
      subscribe: (listener: () => void) => signal.subscribeRecipe(recipeId, field, listener),
      getSnapshot: () => signal.getRecipe(recipeId, field),
    }
  }, [signal, recipeId, field])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Force a component to re-render whenever the solver pushes a new result into
 * the signal. Intended for dialogs / panels that do inline reads of multiple
 * signal namespaces and don't want to wire a subscription per cell.
 */
export function usePriceSignalRevision(signal: PriceSignal): number {
  const [, setRev] = useState(0)
  useEffect(() => {
    return signal.subscribeAny(() => setRev((r) => r + 1))
  }, [signal])
  return 0
}

/**
 * Subscribe to a recipe's cost breakdown (craft time / labor cost). The
 * returned reference is stable between solver runs when the values haven't
 * changed, so React bails out of re-rendering.
 */
export function useRecipeCostCell(
  signal: PriceSignal,
  recipeId: string | null | undefined
): RecipeCostBreakdown | null {
  const { subscribe, getSnapshot } = useMemo(() => {
    if (!recipeId) {
      return {
        subscribe: () => () => {},
        getSnapshot: () => null as RecipeCostBreakdown | null,
      }
    }
    return {
      subscribe: (listener: () => void) => signal.subscribeRecipeCost(recipeId, listener),
      getSnapshot: () => signal.getRecipeCost(recipeId),
    }
  }, [signal, recipeId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
