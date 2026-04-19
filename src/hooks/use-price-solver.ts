import { useCallback, useEffect, useRef, useState } from 'react'

import type { SolverInput, SolverOutput } from '@/types/solver'

const DEBOUNCE_MS = 200

export function usePriceSolver() {
  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [result, setResult] = useState<SolverOutput | null>(null)
  const [solving, setSolving] = useState(false)

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/price-solver.worker.ts', import.meta.url), {
      type: 'module',
    })

    workerRef.current.onmessage = (event: MessageEvent<SolverOutput>) => {
      setResult(event.data)
      setSolving(false)
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  /**
   * Schedule a recalculation. `getInput` is invoked lazily *after* the debounce
   * window so bursts of store mutations collapse into a single snapshot build —
   * the snapshot itself is the bulk of the CPU cost and must not run
   * synchronously in the mutation handler.
   */
  const recalculate = useCallback((getInput: () => SolverInput | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      const input = getInput()
      if (!input) return
      if (workerRef.current) {
        setSolving(true)
        workerRef.current.postMessage(input)
      }
    }, DEBOUNCE_MS)
  }, [])

  return { result, solving, recalculate }
}
