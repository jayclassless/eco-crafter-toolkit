import { useState } from 'react'

/**
 * Runs `onChange` during render whenever `dep` changes identity.
 *
 * This is React's documented "adjusting state when a prop changes" pattern.
 * Setting state during render makes React re-run the component immediately,
 * before anything is committed to the DOM, so the stale value is never
 * painted. Doing the same work in an effect renders the stale value first and
 * then re-renders — an extra commit plus a visible flicker on dialog opens.
 *
 * `onChange` runs during render and must therefore only call state setters —
 * no store writes, no fetches, no DOM access.
 */
export function useResetOnChange<T>(dep: T, onChange: (dep: T, prev: T) => void): void {
  const [prev, setPrev] = useState(dep)
  if (!Object.is(prev, dep)) {
    setPrev(dep)
    onChange(dep, prev)
  }
}
