import { beforeEach, describe, expect, it } from 'vitest'

import type { LocalizedName } from '@/types/game-data'

import {
  __resetLocalizedNameStore,
  deleteLocalizedNamesForDataset,
  loadIndex,
  saveLocalizedNames,
} from '../localized-name-store'

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteDb()
})

const row = (
  id: string,
  entityType: string,
  entityId: string,
  locale: string,
  name: string
): LocalizedName => ({ id, entityType, entityId, locale, name })

describe('localized-name-store', () => {
  it('loadIndex returns an empty Map when no data is saved', async () => {
    const idx = await loadIndex('ds1', 'en-US')
    expect(idx.size).toBe(0)
  })

  it('round-trips saved names', async () => {
    await saveLocalizedNames('ds1', [
      row('1', 'item', 'iron', 'en-US', 'Iron'),
      row('2', 'recipe', 'r1', 'en-US', 'Iron Recipe'),
      row('3', 'item', 'iron', 'fr-FR', 'Fer'),
    ])
    const en = await loadIndex('ds1', 'en-US')
    expect(en.get('item:iron')).toBe('Iron')
    expect(en.get('recipe:r1')).toBe('Iron Recipe')
    expect(en.size).toBe(2)

    const fr = await loadIndex('ds1', 'fr-FR')
    expect(fr.get('item:iron')).toBe('Fer')
    expect(fr.size).toBe(1)
  })

  it('returns the same cached Map instance on repeat loads', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    const first = await loadIndex('ds1', 'en-US')
    const second = await loadIndex('ds1', 'en-US')
    expect(second).toBe(first)
  })

  it('invalidates the cached index for a dataset when saving more rows', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    const before = await loadIndex('ds1', 'en-US')
    expect(before.get('item:iron')).toBe('Iron')

    await saveLocalizedNames('ds1', [
      row('1', 'item', 'iron', 'en-US', 'Iron Ore'),
      row('2', 'item', 'copper', 'en-US', 'Copper'),
    ])
    const after = await loadIndex('ds1', 'en-US')
    expect(after).not.toBe(before)
    expect(after.get('item:iron')).toBe('Iron Ore')
    expect(after.get('item:copper')).toBe('Copper')
  })

  it('deleteLocalizedNamesForDataset removes only the targeted dataset', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    await saveLocalizedNames('ds2', [row('2', 'item', 'iron', 'en-US', 'Iron (ds2)')])

    await deleteLocalizedNamesForDataset('ds1')

    const gone = await loadIndex('ds1', 'en-US')
    expect(gone.size).toBe(0)

    const kept = await loadIndex('ds2', 'en-US')
    expect(kept.get('item:iron')).toBe('Iron (ds2)')
  })

  it('loadIndex for a non-existent locale returns an empty Map', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    const de = await loadIndex('ds1', 'de-DE')
    expect(de.size).toBe(0)
  })
})
