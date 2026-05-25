import { useEffect, useState } from 'react'

// Returns a Date that advances on a fixed interval (default once per minute).
// One shared ticker drives all crop countdowns and growing→pickable→grown
// transitions, so we don't install a timer per row.
export function useNowTick(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
