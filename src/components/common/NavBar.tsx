import { Button } from 'primereact/button'
import { SelectButton } from 'primereact/selectbutton'
import { Tag } from 'primereact/tag'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { PlantIcon } from '@/components/common/PlantIcon'
import { NewsBadgeButton } from '@/components/game-news/NewsBadgeButton'
import { BuildSelector } from '@/components/price-calculator/BuildSelector'
import { useLocalization } from '@/hooks/use-localization'
import { useReleasesBadgeCount } from '@/hooks/use-releases-badge'
import { useStores } from '@/stores/providers'

type ToolName = 'calculator' | 'crops' | 'resources'

interface Props {
  tool: ToolName
  datasetId: string
  // Build props are absent on dataset-scoped tools (resources); the build
  // selector is hidden and tool switching goes through the build-redirect
  // routes, which restore the last-viewed build.
  buildId?: string
  onSelectBuild?: (buildId: string) => void
  onDeletedBuild?: (buildId: string) => void
  onOpenSettings: () => void
  onOpenConfig?: () => void
  // Tool-specific controls rendered immediately after the tool switcher (e.g.
  // the biome selector on the resources page).
  children?: ReactNode
}

// Shared top navigation for every tool. Hosts the tool switcher, dataset name,
// build selector, news badge and settings menu. Builds are shared across tools,
// so switching preserves the active dataset+build.
export function NavBar({
  tool,
  datasetId,
  buildId,
  onSelectBuild,
  onDeletedBuild,
  onOpenSettings,
  onOpenConfig,
  children,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { formatNumber } = useLocalization()
  const { gameDataStore } = useStores()
  const datasetName = (gameDataStore.getCell('datasets', datasetId, 'name') as string) ?? ''
  const releasesCount = useReleasesBadgeCount()

  const toolOptions = [
    { value: 'calculator' as ToolName, label: t('nav.calculator'), icon: 'pi pi-calculator' },
    { value: 'crops' as ToolName, label: t('nav.crops'), icon: '' },
    { value: 'resources' as ToolName, label: t('nav.resources'), icon: 'pi pi-map' },
  ]

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
      <Tag severity="warning" value="BETA" />
      <span className="font-semibold text-color-secondary">{datasetName}</span>
      <SelectButton
        value={tool}
        options={toolOptions}
        optionValue="value"
        aria-label={t('nav.toolSwitcher')}
        allowEmpty={false}
        itemTemplate={(option) =>
          option.value === 'crops' ? (
            <PlantIcon title={option.label} />
          ) : (
            <i className={option.icon} title={option.label} />
          )
        }
        onChange={(e) => {
          const next = e.value as ToolName | null
          if (!next || next === tool) return
          if (next === 'resources') navigate(`/${datasetId}/resources`)
          else if (buildId) navigate(`/${datasetId}/${next}/${buildId}`)
          else navigate(`/${datasetId}/${next}`)
        }}
      />
      {children}
      {buildId && onSelectBuild && onDeletedBuild && (
        <BuildSelector
          datasetId={datasetId}
          activeBuildId={buildId}
          onSelect={onSelectBuild}
          onDeleted={onDeletedBuild}
        />
      )}
      <NewsBadgeButton />
      <Button
        icon="pi pi-bars"
        text
        onClick={onOpenSettings}
        badge={releasesCount > 0 ? formatNumber(releasesCount) : undefined}
        badgeClassName="p-badge-danger"
      />
    </div>
  )
}
