import type { LocalizedName } from '@/types/game-data'

const DB_NAME = 'eco-crafter-localized-names'
const STORE_NAME = 'names'
const DB_VERSION = 1

type StoredValue = Record<string /* entityType */, Record<string /* entityId */, string>>

export type LocalizedNameIndex = Map<string /* `${entityType}:${entityId}` */, string>

let dbPromise: Promise<IDBDatabase> | null = null
const cache = new Map<string /* `${datasetId}:${locale}` */, LocalizedNameIndex>()

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
}

export async function __resetLocalizedNameStore(): Promise<void> {
  cache.clear()
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}
