import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'

import { useBuild } from '@/hooks/use-build'
import { useStores } from '@/stores/providers'

interface Props {
  // Which tool to redirect into. Builds are shared across tools, so the
  // get-or-create logic is identical; only the target path differs.
  tool?: 'calculator' | 'crops'
}

export function BuildRedirect({ tool = 'calculator' }: Props = {}) {
  const { datasetId } = useParams<{ datasetId: string }>()
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getBuilds, createBuild } = useBuild()
  const [createdBuildId, setCreatedBuildId] = useState<string | null>(null)
  // Ref guard so StrictMode's dev double-invoke of effects can't create a
  // second build: the setState write isn't visible to the second invocation
  // (same closure), but a ref write is.
  const creatingRef = useRef(false)

  const datasetExists = !!datasetId && gameDataStore.hasRow('datasets', datasetId)
  const builds = datasetExists ? getBuilds(datasetId!) : []
  const needsCreate = datasetExists && builds.length === 0

  // Auto-create only when the dataset truly has no builds. The common path
  // (existing builds) is resolved synchronously below — no effect, no blank
  // frame between mount and redirect.
  useEffect(() => {
    if (!needsCreate || !datasetId || creatingRef.current) return
    creatingRef.current = true
    const id = createBuild(datasetId, t('build.selector.defaultName', { number: 1 }))
    setCreatedBuildId(id)
  }, [needsCreate, datasetId, createBuild, t])

  if (!datasetExists) return <Navigate to="/" replace />

  const targetBuildId = builds.length > 0 ? (builds[0].id as string) : createdBuildId
  if (targetBuildId) return <Navigate to={`/${datasetId}/${tool}/${targetBuildId}`} replace />
  return null
}
