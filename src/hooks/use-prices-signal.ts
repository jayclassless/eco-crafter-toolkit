import { useMemo, useRef, useSyncExternalStore } from 'react'

export interface PriceEntry {
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

function createPriceSignal(): PriceSignal {
  let itemPrices: PricesMap = {}
  let recipePrices: PricesMap = {}
  const itemListeners = new Map<string, Set<() => void>>()
  const recipeListeners = new Map<string, Set<() => void>>()

  return {
    set(prices) {
      const prev = itemPrices
      itemPrices = prices
      notifyChangedCells(itemListeners, prev, prices)
    },
    setRecipe(prices) {
      const prev = recipePrices
      recipePrices = prices
      notifyChangedCells(recipeListeners, prev, prices)
    },
    subscribe(itemId, field, listener) {
      return addListener(itemListeners, itemId, field, listener)
    },
    subscribeRecipe(recipeId, field, listener) {
      return addListener(recipeListeners, recipeId, field, listener)
    },
    get(itemId, field) {
      const entry = itemPrices[itemId]
      return entry ? entry[field] : null
    },
    getRecipe(recipeId, field) {
      const entry = recipePrices[recipeId]
      return entry ? entry[field] : null
    },
    getRecipeIdFor(itemId) {
      const entry = itemPrices[itemId]
      return entry?.recipeId ?? ''
    },
    getAll() {
      return itemPrices
    },
  }
}

/**
 * Hook that owns a stable `PriceSignal` for the lifetime of the component.
 * Callers push new prices via `signal.set(...)` from an effect.
 */
export function usePriceSignal(): PriceSignal {
  const ref = useRef<PriceSignal | null>(null)
  if (!ref.current) ref.current = createPriceSignal()
  return ref.current
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
