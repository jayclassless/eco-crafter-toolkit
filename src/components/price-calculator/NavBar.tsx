import { Button } from 'primereact/button'
import { useTranslation } from 'react-i18next'

import { NewsBadgeButton } from '@/components/game-news/NewsBadgeButton'
import { useStores } from '@/stores/providers'

import { BuildSelector } from './BuildSelector'

interface Props {
  datasetId: string
  buildId: string
  onSelectBuild: (buildId: string) => void
  onDeletedBuild: (buildId: string) => void
  onOpenSettings: () => void
  onOpenConfig?: () => void
}

export function NavBar({
  datasetId,
  buildId,
  onSelectBuild,
  onDeletedBuild,
  onOpenSettings,
  onOpenConfig,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const datasetName = (gameDataStore.getCell('datasets', datasetId, 'name') as string) ?? ''

  return (
    <div className="flex align-items-center gap-3 p-2 pb-0">
      {onOpenConfig && (
        <Button
          icon="pi pi-sliders-h"
          text
          aria-label={t('priceCalculator.openConfig')}
          title={t('priceCalculator.openConfig')}
          onClick={onOpenConfig}
        />
      )}
      <img
        src="/icons/favicon-256x256.png"
        alt={t('common.title')}
        title={t('common.title')}
        className="block"
        style={{ height: '2rem', width: 'auto' }}
      />
      <span className="font-semibold text-color-secondary">{datasetName}</span>
      <BuildSelector
        datasetId={datasetId}
        activeBuildId={buildId}
        onSelect={onSelectBuild}
        onDeleted={onDeletedBuild}
      />
      <NewsBadgeButton />
      <Button icon="pi pi-bars" text onClick={onOpenSettings} />
    </div>
  )
}
