import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

interface UsePriceManagement {
  /**
   * Sets the user-entered price for an item or tag. Creates the row if it
   * doesn't exist yet. A null price is normalized to 0. Typing a price
   * implies `'manual'` mode; the row's priceMode is set accordingly.
   */
  setPrice: (itemOrTagId: string, price: number | null, userPriceId?: string) => void
  /**
   * Sets the price-resolution mode for a tag. Creates the row if it doesn't
   * exist yet.
   */
  setPriceMode: (itemOrTagId: string, mode: PriceMode, userPriceId?: string) => void
  /**
   * Sets which associated item a tag mirrors (only meaningful when the tag's
   * priceMode is `'mirror'`). Creates the row if it doesn't exist yet.
   */
  setPrimaryItem: (itemOrTagId: string, primaryItemId: string, userPriceId?: string) => void
  /**
   * Moves an item between the Products list and the Materials list.
   * `value=true` excludes it from products: solver stops emitting candidates
   * for it and downstream recipes consume it at the user's manual price.
   * `value=false` lets the solver produce it again. The stored `price` is
   * preserved either way so re-enabling restores the prior value.
   */
  setOverrideAsMaterial: (itemOrTagId: string, value: boolean, userPriceId?: string) => void
}

export function createPriceManagement(buildStore: Store, buildId: string): UsePriceManagement {
  return {
    setPrice: (itemOrTagId: string, price: number | null, userPriceId?: string) => {
      if (userPriceId) {
        // Transaction batches the two cell writes into a single listener
        // sweep. Without it, each setCell fires subscribers separately, so
        // editing an existing manual price did two full React commits per
        // keystroke. Also skip the priceMode write when it's already
        // 'manual' — halves listener work for the common edit-in-place case.
        buildStore.transaction(() => {
          buildStore.setCell('userPrices', userPriceId, 'price', price ?? 0)
          const mode = buildStore.getCell('userPrices', userPriceId, 'priceMode')
          if (mode !== 'manual') {
            buildStore.setCell('userPrices', userPriceId, 'priceMode', 'manual')
          }
        })
        return
      }
      const id = generateId()
      buildStore.setRow('userPrices', id, {
        id,
        buildId,
        itemOrTagId,
        price: price ?? 0,
        isOverride: false,
        primaryItemId: '',
        priceMode: 'manual',
      })
    },
    setPriceMode: (itemOrTagId: string, mode: PriceMode, userPriceId?: string) => {
      if (userPriceId) {
        buildStore.setCell('userPrices', userPriceId, 'priceMode', mode)
        return
      }
      const id = generateId()
      buildStore.setRow('userPrices', id, {
        id,
        buildId,
        itemOrTagId,
        price: 0,
        isOverride: false,
        primaryItemId: '',
        priceMode: mode,
      })
    },
    setPrimaryItem: (itemOrTagId: string, primaryItemId: string, userPriceId?: string) => {
      if (userPriceId) {
        buildStore.setCell('userPrices', userPriceId, 'primaryItemId', primaryItemId)
        return
      }
      const id = generateId()
      buildStore.setRow('userPrices', id, {
        id,
        buildId,
        itemOrTagId,
        price: 0,
        isOverride: false,
        primaryItemId,
        priceMode: 'mirror',
      })
    },
    setOverrideAsMaterial: (itemOrTagId: string, value: boolean, userPriceId?: string) => {
      if (userPriceId) {
        // Coalesce the two cell writes so listeners fire once per toggle.
        // When excluding (value=true) we also force priceMode='manual' —
        // the solver only treats override rows as materials when both flags
        // align (see use-solver-snapshot.ts excludedItems).
        buildStore.transaction(() => {
          buildStore.setCell('userPrices', userPriceId, 'isOverride', value)
          if (value) {
            const mode = buildStore.getCell('userPrices', userPriceId, 'priceMode')
            if (mode !== 'manual') {
              buildStore.setCell('userPrices', userPriceId, 'priceMode', 'manual')
            }
          }
        })
        return
      }
      const id = generateId()
      buildStore.setRow('userPrices', id, {
        id,
        buildId,
        itemOrTagId,
        price: 0,
        isOverride: value,
        primaryItemId: '',
        priceMode: 'manual',
      })
    },
  }
}

export function usePriceManagement(buildId: string): UsePriceManagement {
  const { buildStore } = useStores()
  return useMemo(() => createPriceManagement(buildStore, buildId), [buildStore, buildId])
}
