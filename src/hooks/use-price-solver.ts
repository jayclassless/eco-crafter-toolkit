import * as Sentry from '@sentry/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SolverInput, SolverOutput, SolverWorkerMessage } from '@/types/solver'

const DEBOUNCE_MS = 200

export function usePriceSolver() {
  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [result, setResult] = useState<SolverOutput | null>(null)
  const [solving, setSolving] = useState(false)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/price-solver.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<SolverWorkerMessage>) => {
      const message = event.data
      if (message.type === 'result') {
        setResult(message.result)
      } else {
        // The worker caught a thrown solve(); surface it instead of leaving the
        // UI stuck "solving" forever with stale prices.
        Sentry.captureException(new Error(`Price solver failed: ${message.message}`))
      }
      setSolving(false)
    }

    // Fires on uncaught worker errors (e.g. a parse/runtime fault the try/catch
    // in the worker can't reach). Without this the worker dies silently.
    worker.onerror = (event) => {
      Sentry.captureException(new Error(`Price solver worker crashed: ${event.message}`))
      setSolving(false)
    }

    return () => {
      // Clear any pending debounce before tearing down — otherwise a timer that
      // fires after unmount would post to a terminated worker and call
      // setSolving on an unmounted component.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      worker.terminate()
      workerRef.current = null
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
