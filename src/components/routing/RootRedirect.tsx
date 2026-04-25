import { Navigate } from 'react-router-dom'

import { useStores } from '@/stores/providers'

export function RootRedirect() {
  const { gameDataStore, uiStore } = useStores()

  const stored = uiStore.getCell('uiState', 'main', 'activeDatasetId') as string
  const allIds = gameDataStore.getRowIds('datasets')
  const datasetId = stored && allIds.includes(stored) ? stored : allIds[0]

  if (!datasetId) return null

  return <Navigate to={`/${datasetId}/calculator`} replace />
}
