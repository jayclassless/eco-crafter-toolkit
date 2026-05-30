import { solve } from '@/lib/solver'
import type { SolverInput, SolverWorkerMessage } from '@/types/solver'

self.onmessage = (event: MessageEvent<SolverInput>) => {
  try {
    const result = solve(event.data)
    const message: SolverWorkerMessage = { type: 'result', result }
    self.postMessage(message)
  } catch (error) {
    const message: SolverWorkerMessage = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(message)
  }
}
