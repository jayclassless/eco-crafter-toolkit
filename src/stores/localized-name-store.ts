import type { LocalizedName } from '@/types/game-data'

const DB_NAME = 'eco-crafter-localized-names'
const STORE_NAME = 'names'
const DB_VERSION = 1

type StoredValue = Record<string /* entityType */, Record<string /* entityId */, string>>

export type LocalizedNameIndex = Map<string /* `${entityType}:${entityId}` */, string>

let dbPromise: Promise<IDBDatabase> | null = null
const cache = new Map<string /* `${datasetId}:${locale}` */, LocalizedNameIndex>()

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

  const db = await openDb()
  const value = await new Promise<StoredValue | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(cacheKey)
    req.onsuccess = () => resolve(req.result as StoredValue | undefined)
    req.onerror = () => reject(req.error)
  })

  const index: LocalizedNameIndex = new Map()
  if (value) {
    for (const [entityType, byId] of Object.entries(value)) {
      for (const [entityId, name] of Object.entries(byId)) {
        index.set(`${entityType}:${entityId}`, name)
      }
    }
  }
  cache.set(cacheKey, index)
  return index
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
    tx.onerror = () => reject(tx.error)
  })

  for (const key of cache.keys()) {
    if (key.startsWith(`${datasetId}:`)) cache.delete(key)
  }
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
      getReq.onerror = () => reject(getReq.error)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  for (const key of cache.keys()) {
    if (key.startsWith(`${datasetId}:`)) cache.delete(key)
  }
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
    cursorReq.onerror = () => reject(cursorReq.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  for (const key of cache.keys()) {
    if (key.startsWith(`${datasetId}:`)) cache.delete(key)
  }
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
    cursorReq.onerror = () => reject(cursorReq.error)
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
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
    tx.onerror = () => reject(tx.error)
  })
  for (const key of cache.keys()) {
    if (key.startsWith(`${datasetId}:`)) cache.delete(key)
  }
  notifyChange(datasetId)
}

export async function __resetLocalizedNameStore(): Promise<void> {
  cache.clear()
  changeListeners.clear()
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}
