import { useRef } from 'react'

/**
 * Returns the previous reference if it's content-equal to `value`, otherwise
 * returns `value`. Use to keep a Map/Set reference stable across renders when
 * its contents haven't changed — downstream `useCallback` / `useMemo`
 * consumers can then bail out via dep equality.
 *
 * The compute step (building the candidate value) still runs on every render,
 * so this is only worthwhile when the downstream cost (re-render of a large
 * DataTable, expensive memo) dominates the cost of the equality check.
 */
export function useStableContent<T>(value: T, isEqual: (a: T, b: T) => boolean): T {
  const ref = useRef<T>(value)
  if (ref.current !== value && !isEqual(ref.current, value)) {
    ref.current = value
  }
  return ref.current
}

export function mapEquals<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false
  }
  return true
}

export function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const v of a) {
    if (!b.has(v)) return false
  }
  return true
}

/**
 * Shallow-compare two arrays element-by-element using a per-element
 * equality predicate. Lengths compared first, then each pair.
 */
export function arrayEquals<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!eq(a[i], b[i])) return false
  }
  return true
}

/**
 * Shallow-equality predicate for objects with a known set of scalar keys.
 * Returns false on any mismatched key value (strict equality).
 */
export function shallowEquals<T extends object>(a: T, b: T): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a) as (keyof T)[]
  const bKeys = Object.keys(b) as (keyof T)[]
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}
