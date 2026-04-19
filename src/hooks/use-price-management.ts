import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

export interface UsePriceManagement {
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
}

export function createPriceManagement(buildStore: Store, buildId: string): UsePriceManagement {
  return {
    setPrice: (itemOrTagId: string, price: number | null, userPriceId?: string) => {
      if (userPriceId) {
        buildStore.setCell('userPrices', userPriceId, 'price', price ?? 0)
        buildStore.setCell('userPrices', userPriceId, 'priceMode', 'manual')
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
  }
}

export function usePriceManagement(buildId: string): UsePriceManagement {
  const { buildStore } = useStores()
  return useMemo(() => createPriceManagement(buildStore, buildId), [buildStore, buildId])
}
