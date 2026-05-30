import { toStoreError } from '@/lib/storage-quota'
import type { LocalizedName } from '@/types/game-data'

const DB_NAME = 'eco-crafter-localized-names'
const STORE_NAME = 'names'
const DB_VERSION = 1

type StoredValue = Record<string /* entityType */, Record<string /* entityId */, string>>

export type LocalizedNameIndex = Map<string /* `${entityType}:${entityId}` */, string>

let dbPromise: Promise<IDBDatabase> | null = null
const cache = new Map<string /* `${datasetId}:${locale}` */, LocalizedNameIndex>()
// In-flight loads keyed by `${datasetId}:${locale}`. `useLocalizedName` mounts
// in many cells at once; on a cache miss they'd otherwise each issue their own
// IDB read and build their own Map, so callers would hold *different* Map
// instances for the same data — defeating the `Object.is` re-render bailout.
// Sharing one promise per key means one read, one Map, identical references.
const inFlight = new Map<string /* `${datasetId}:${locale}` */, Promise<LocalizedNameIndex>>()

/**
 * Drop all cached + in-flight indexes for a dataset (every locale). Called
 * after any write so the next `loadIndex` re-reads fresh data.
 */
function invalidateDataset(datasetId: string): void {
  const prefix = `${datasetId}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key)
  }
}

type ChangeListener = (datasetId: string) => void
const changeListeners = new Set<ChangeListener>()

function notifyChange(datasetId: string): void {
  for (const listener of changeListeners) listener(datasetId)
}

/**
 * Subscribe to write events on the localized-name store. The listener is
 * invoked with the affected `datasetId` whenever names are added, updated, or
 * removed. Used by `useLocalizedName` so React state reflects renames of
 * custom entities without waiting for a remount.
 */
export function subscribeLocalizedNames(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/**
 * Sync accessor for an already-loaded index. Returns null on cache miss so
 * callers can decide whether to kick off `loadIndex` (async) or render with
 * empty names. Used by `useLocalizedName` to initialize state from the cache
 * the app prefetches at startup, avoiding a first-render flash of empty names.
 */
export function peekIndex(datasetId: string, locale: string): LocalizedNameIndex | null {
  return cache.get(`${datasetId}:${locale}`) ?? null
}

export async function loadIndex(datasetId: string, locale: string): Promise<LocalizedNameIndex> {
  const cacheKey = `${datasetId}:${locale}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const pending = inFlight.get(cacheKey)
  if (pending) return pending

  const promise = (async (): Promise<LocalizedNameIndex> => {
    const db = await openDb()
    const value = await new Promise<StoredValue | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(cacheKey)
      req.onsuccess = () => resolve(req.result as StoredValue | undefined)
      req.onerror = () => reject(toStoreError(req.error))
    })

    const index: LocalizedNameIndex = new Map()
    if (value) {
      for (const [entityType, byId] of Object.entries(value)) {
        for (const [entityId, name] of Object.entries(byId)) {
          index.set(`${entityType}:${entityId}`, name)
        }
      }
    }
    return index
  })()

  inFlight.set(cacheKey, promise)
  void promise
    .then((index) => {
      // Commit to the shared cache only if this load is still current. A write
      // (invalidateDataset) may have cleared us mid-read, in which case our
      // value is stale and a fresh load will run — don't repopulate the cache.
      if (inFlight.get(cacheKey) === promise) cache.set(cacheKey, index)
    })
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey)
    })
  return promise
}

export async function saveLocalizedNames(datasetId: string, rows: LocalizedName[]): Promise<void> {
  const byLocale = new Map<string, StoredValue>()
  for (const r of rows) {
    let bucket = byLocale.get(r.locale)
    if (!bucket) {
      bucket = {}
      byLocale.set(r.locale, bucket)
    }
    let typeBucket = bucket[r.entityType]
    if (!typeBucket) {
      typeBucket = {}
      bucket[r.entityType] = typeBucket
    }
    typeBucket[r.entityId] = r.name
  }

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const os = tx.objectStore(STORE_NAME)
    for (const [locale, value] of byLocale) {
      os.put(value, `${datasetId}:${locale}`)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toStoreError(tx.error))
    tx.onabort = () => reject(toStoreError(tx.error))
  })

  invalidateDataset(datasetId)
  notifyChange(datasetId)
}

/**
 * Merge-write: load each affected (datasetId, locale) bucket, apply the new
 * rows on top, write back. Use this when adding or updating individual names
 * in a dataset that already has names — `saveLocalizedNames` does a wholesale
 * replace and would lose the rest.
 */
export async function upsertLocalizedNames(
  datasetId: string,
  rows: LocalizedName[]
): Promise<void> {
  if (rows.length === 0) return
  const byLocale = new Map<string, LocalizedName[]>()
  for (const r of rows) {
    let list = byLocale.get(r.locale)
    if (!list) {
      list = []
      byLocale.set(r.locale, list)
    }
    list.push(r)
  }

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const os = tx.objectStore(STORE_NAME)
    let pending = byLocale.size
    if (pending === 0) {
      resolve()
      return
    }
    for (const [locale, localeRows] of byLocale) {
      const key = `${datasetId}:${locale}`
      const getReq = os.get(key)
      getReq.onsuccess = () => {
        const value = (getReq.result as StoredValue | undefined) ?? {}
        for (const r of localeRows) {
          let typeBucket = value[r.entityType]
          if (!typeBucket) {
            typeBucket = {}
            value[r.entityType] = typeBucket
          }
          typeBucket[r.entityId] = r.name
        }
        os.put(value, key)
        pending--
      }
      getReq.onerror = () => reject(toStoreError(getReq.error))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toStoreError(tx.error))
    tx.onabort = () => reject(toStoreError(tx.error))
  })

  invalidateDataset(datasetId)
  notifyChange(datasetId)
}

/**
 * Remove a single entity's name from every locale stored for the dataset.
 * Used when a custom item or recipe is deleted.
 */
export async function removeLocalizedName(
  datasetId: string,
  entityType: string,
  entityId: string
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const os = tx.objectStore(STORE_NAME)
    const range = IDBKeyRange.bound(`${datasetId}:`, `${datasetId}:￿`, false, false)
    const cursorReq = os.openCursor(range)
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor) return
      const value = cursor.value as StoredValue
      const typeBucket = value[entityType]
      if (typeBucket && typeBucket[entityId] !== undefined) {
        delete typeBucket[entityId]
        if (Object.keys(typeBucket).length === 0) delete value[entityType]
        cursor.update(value)
      }
      cursor.continue()
    }
    cursorReq.onerror = () => reject(toStoreError(cursorReq.error))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toStoreError(tx.error))
    tx.onabort = () => reject(toStoreError(tx.error))
  })

  invalidateDataset(datasetId)
  notifyChange(datasetId)
}

/**
 * Read every stored entry for one entity (across all locales). Used by the
 * dataset-update flow to migrate a custom entity's names to the new dataset.
 */
export async function readLocalizedNamesForEntity(
  datasetId: string,
  entityType: string,
  entityId: string
): Promise<LocalizedName[]> {
  const db = await openDb()
  return new Promise<LocalizedName[]>((resolve, reject) => {
    const out: LocalizedName[] = []
    const tx = db.transaction(STORE_NAME, 'readonly')
    const os = tx.objectStore(STORE_NAME)
    const range = IDBKeyRange.bound(`${datasetId}:`, `${datasetId}:￿`, false, false)
    const cursorReq = os.openCursor(range)
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor) return
      const key = cursor.key as string
      const locale = key.slice(datasetId.length + 1)
      const value = cursor.value as StoredValue
      const typeBucket = value[entityType]
      const name = typeBucket?.[entityId]
      if (name !== undefined) {
        out.push({ id: '', entityType, entityId, locale, name })
      }
      cursor.continue()
    }
    cursorReq.onerror = () => reject(toStoreError(cursorReq.error))
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(toStoreError(tx.error))
    tx.onabort = () => reject(toStoreError(tx.error))
  })
}

export async function deleteLocalizedNamesForDataset(datasetId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    // generateId() never produces '\uffff', so the upper bound captures exactly
    // `${datasetId}:*`.
    const range = IDBKeyRange.bound(`${datasetId}:`, `${datasetId}:\uffff`, false, false)
    tx.objectStore(STORE_NAME).delete(range)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toStoreError(tx.error))
    tx.onabort = () => reject(toStoreError(tx.error))
  })
  invalidateDataset(datasetId)
  notifyChange(datasetId)
}

export async function __resetLocalizedNameStore(): Promise<void> {
  cache.clear()
  inFlight.clear()
  changeListeners.clear()
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}
