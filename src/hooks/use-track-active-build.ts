import { useEffect } from 'react'
import type { Store } from 'tinybase'

/**
 * Persist last-used ids whenever a valid dataset/build is being viewed.
 *
 * - `activeDatasetId`: RootRedirect uses it to pick a landing page next visit.
 * - `activeBuildId`: a global last-used hint; purge-data clears it when its
 *   build is deleted (src/lib/purge-data.ts).
 * - `lastViewedBuilds` (keyed by datasetId): BuildRedirect uses it to land on
 *   the build last viewed for *this* dataset instead of the first one.
 *
 * Shared by PriceCalculator and CropTracker, which both treat the URL as the
 * source of truth and validate params before recording.
 */
export function useTrackActiveBuild(
  uiStore: Store,
  datasetId: string | undefined,
  buildId: string | undefined,
  buildValid: boolean
) {
  useEffect(() => {
    if (!buildValid || !datasetId || !buildId) return
    uiStore.transaction(() => {
      uiStore.setCell('uiState', 'main', 'activeDatasetId', datasetId)
      uiStore.setCell('uiState', 'main', 'activeBuildId', buildId)
      uiStore.setCell('lastViewedBuilds', datasetId, 'buildId', buildId)
    })
  }, [buildValid, datasetId, buildId, uiStore])
}
