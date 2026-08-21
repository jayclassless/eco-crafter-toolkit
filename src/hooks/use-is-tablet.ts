import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 1279.98px)'

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (!supported()) return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useIsTablet(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
