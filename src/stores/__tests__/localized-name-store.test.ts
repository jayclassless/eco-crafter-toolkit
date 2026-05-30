import { beforeEach, describe, expect, it } from 'vitest'

import type { LocalizedName } from '@/types/game-data'

import {
  __resetLocalizedNameStore,
  deleteLocalizedNamesForDataset,
  loadIndex,
  readLocalizedNamesForEntity,
  removeLocalizedName,
  saveLocalizedNames,
  subscribeLocalizedNames,
  upsertLocalizedNames,
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

  it('dedups concurrent cache-miss loads into one shared Map instance', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    // Force a cache miss so both calls race the IDB read, then share the result.
    await __resetLocalizedNameStore()

    const [a, b, c] = await Promise.all([
      loadIndex('ds1', 'en-US'),
      loadIndex('ds1', 'en-US'),
      loadIndex('ds1', 'en-US'),
    ])
    // All three resolve to the very same Map — without dedup each would build
    // its own, defeating the useLocalizedName Object.is re-render bailout.
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(a.get('item:iron')).toBe('Iron')
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

  it('upsertLocalizedNames merges into the existing bucket without losing other entries', async () => {
    await saveLocalizedNames('ds1', [
      row('1', 'item', 'iron', 'en-US', 'Iron'),
      row('2', 'item', 'copper', 'en-US', 'Copper'),
    ])

    await upsertLocalizedNames('ds1', [row('3', 'item', 'iron', 'en-US', 'Iron Bar')])

    const idx = await loadIndex('ds1', 'en-US')
    expect(idx.get('item:iron')).toBe('Iron Bar')
    expect(idx.get('item:copper')).toBe('Copper')
  })

  it('upsertLocalizedNames is a no-op when given an empty list', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    await upsertLocalizedNames('ds1', [])
    const idx = await loadIndex('ds1', 'en-US')
    expect(idx.get('item:iron')).toBe('Iron')
  })

  it('removeLocalizedName drops only the targeted entity, across all locales', async () => {
    await saveLocalizedNames('ds1', [
      row('1', 'item', 'iron', 'en-US', 'Iron'),
      row('2', 'item', 'iron', 'fr-FR', 'Fer'),
      row('3', 'item', 'copper', 'en-US', 'Copper'),
    ])

    await removeLocalizedName('ds1', 'item', 'iron')

    const en = await loadIndex('ds1', 'en-US')
    expect(en.get('item:iron')).toBeUndefined()
    expect(en.get('item:copper')).toBe('Copper')

    const fr = await loadIndex('ds1', 'fr-FR')
    expect(fr.get('item:iron')).toBeUndefined()
  })

  it('readLocalizedNamesForEntity returns one row per locale for the entity', async () => {
    await saveLocalizedNames('ds1', [
      row('1', 'item', 'iron', 'en-US', 'Iron'),
      row('2', 'item', 'iron', 'fr-FR', 'Fer'),
      row('3', 'item', 'copper', 'en-US', 'Copper'),
    ])

    const rows = await readLocalizedNamesForEntity('ds1', 'item', 'iron')
    expect(rows).toHaveLength(2)
    const names = rows.map((r) => `${r.locale}:${r.name}`).sort()
    expect(names).toEqual(['en-US:Iron', 'fr-FR:Fer'])
  })

  it('readLocalizedNamesForEntity returns an empty list when the entity has no entries', async () => {
    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    const rows = await readLocalizedNamesForEntity('ds1', 'item', 'unknown')
    expect(rows).toHaveLength(0)
  })

  it('subscribeLocalizedNames notifies on save / upsert / remove / dataset delete', async () => {
    const events: string[] = []
    const unsubscribe = subscribeLocalizedNames((id) => events.push(id))

    await saveLocalizedNames('ds1', [row('1', 'item', 'iron', 'en-US', 'Iron')])
    await upsertLocalizedNames('ds1', [row('2', 'item', 'iron', 'en-US', 'Iron Bar')])
    await removeLocalizedName('ds1', 'item', 'iron')
    await deleteLocalizedNamesForDataset('ds1')

    expect(events).toEqual(['ds1', 'ds1', 'ds1', 'ds1'])
    unsubscribe()

    // After unsubscribe further writes do not fire.
    await saveLocalizedNames('ds2', [row('3', 'item', 'wood', 'en-US', 'Wood')])
    expect(events).toEqual(['ds1', 'ds1', 'ds1', 'ds1'])
  })
})
