import { BuildRedirect } from './BuildRedirect'

// Redirects /:datasetId/crops to /:datasetId/crops/:buildId, reusing
// BuildRedirect's get-or-create logic (builds are shared across tools).
export function CropsRedirect() {
  return <BuildRedirect tool="crops" />
}
