import { useEffect, useState } from 'react'

const QUERY = '(max-width: 1279.98px)'

function getInitial(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState<boolean>(getInitial)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches)
    setIsTablet(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isTablet
}
