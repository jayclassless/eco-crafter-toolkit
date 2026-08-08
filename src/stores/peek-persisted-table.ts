import { toStoreError } from '@/lib/storage-quota'

/**
 * TinyBase's IndexedDB persister uses exactly two object stores: `t` for tables
 * and `v` for values, both with `keyPath: 'k'`. The `t` store holds one record
 * per table, shaped `{ k: <tableId>, v: { <rowId>: { <cellId>: value } } }`.
 */
const TABLES_OBJECT_STORE = 't'

/** One table exactly as the persister stored it: rowId -> cellId -> value. */
type PersistedTable = Record<string, Record<string, unknown>>

interface PersistedTableRecord {
  k: string
  v: PersistedTable
}

/**
 * Read a SINGLE table out of a TinyBase persister database, without
 * materialising the rest of the store.
 *
 * This exists for the pre-v14 module migrations, which need a handful of cells
 * from one table *before* the schema'd store is constructed (see the 🛑 notes in
 * `game-data-store.ts` / `build-store.ts` for why the ordering is mandatory).
 * The obvious way to do that — a bare `createStore()` plus `persister.load()` —
 * deserialises every table and replays it through `setContent`, which on the
 * game-data database is ~24k rows and roughly doubles cold-start time. Doing it
 * for ~59 `pluginModules` rows is not a trade worth making, and it never
 * disarms: the cost is paid on every launch, forever, long after the migration
 * has nothing left to find.
 *
 * Returns `{}` for a missing database, a database the persister has never
 * written, a table that isn't present, or any read failure — a first launch is
 * not an error, and callers treat "nothing to migrate" and "couldn't look"
 * identically.
 */
export async function peekPersistedTable(dbName: string, tableId: string): Promise<PersistedTable> {
  if (typeof indexedDB === 'undefined') return {}
  try {
    return await readTable(dbName, tableId)
  } catch {
    return {}
  }
}

function readTable(dbName: string, tableId: string): Promise<PersistedTable> {
  return new Promise((resolve, reject) => {
    // Deliberately no version. The persister opens with version 2 only on its
    // WRITE path (that's where it creates the two object stores); its read path
    // passes no version. Since a persisted database is already at version 2,
    // requesting an explicit version here would throw VersionError.
    const req = indexedDB.open(dbName)
    req.onerror = () => reject(toStoreError(req.error))
    // Fires only when the database did not exist. We deliberately create
    // nothing — the empty database that results is handled by the
    // `objectStoreNames` check below, and the real persister will upgrade it to
    // version 2 on its first save.
    req.onupgradeneeded = () => {}
    req.onsuccess = () => {
      const db = req.result
      const done = (table: PersistedTable) => {
        db.close()
        resolve(table)
      }
      const fail = (err: unknown) => {
        db.close()
        reject(toStoreError(err))
      }

      // A database the persister has never written to has no object stores at
      // all. Opening it above just created an empty one, and `transaction()`
      // would throw NotFoundError — so check rather than catch.
      if (!db.objectStoreNames.contains(TABLES_OBJECT_STORE)) {
        done({})
        return
      }

      try {
        const tx = db.transaction(TABLES_OBJECT_STORE, 'readonly')
        const get = tx.objectStore(TABLES_OBJECT_STORE).get(tableId)
        get.onsuccess = () => done((get.result as PersistedTableRecord | undefined)?.v ?? {})
        get.onerror = () => fail(get.error)
        tx.onabort = () => fail(tx.error)
      } catch (err) {
        fail(err)
      }
    }
  })
}
