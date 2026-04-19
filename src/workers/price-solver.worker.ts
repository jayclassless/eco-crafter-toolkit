import { solve } from '@/lib/solver'
import type { SolverInput, SolverOutput } from '@/types/solver'

self.onmessage = (event: MessageEvent<SolverInput>) => {
  const result: SolverOutput = solve(event.data)
  self.postMessage(result)
}
