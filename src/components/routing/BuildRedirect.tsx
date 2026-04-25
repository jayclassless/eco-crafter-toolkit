import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'

import { useBuild } from '@/hooks/use-build'
import { useStores } from '@/stores/providers'

export function BuildRedirect() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getBuilds, createBuild } = useBuild()
  const [createdBuildId, setCreatedBuildId] = useState<string | null>(null)

  const datasetExists = !!datasetId && gameDataStore.hasRow('datasets', datasetId)
  const builds = datasetExists ? getBuilds(datasetId!) : []
  const needsCreate = datasetExists && builds.length === 0

  // Auto-create only when the dataset truly has no builds. The common path
  // (existing builds) is resolved synchronously below — no effect, no blank
  // frame between mount and redirect.
  useEffect(() => {
    if (!needsCreate || !datasetId || createdBuildId) return
    const id = createBuild(datasetId, t('build.selector.defaultName', { number: 1 }))
    setCreatedBuildId(id)
  }, [needsCreate, datasetId, createBuild, createdBuildId, t])

  if (!datasetExists) return <Navigate to="/" replace />

  const targetBuildId = builds.length > 0 ? (builds[0].id as string) : createdBuildId
  if (targetBuildId) return <Navigate to={`/${datasetId}/calculator/${targetBuildId}`} replace />
  return null
}
