import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { useTranslation } from 'react-i18next'

import { useStores } from '@/stores/providers'

interface Props {
  activeDatasetId: string
  onSelect: (datasetId: string) => void
}

export function DatasetSelector({ activeDatasetId, onSelect }: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()

  const datasets = gameDataStore.getRowIds('datasets').map((id) => ({
    id,
    name: gameDataStore.getCell('datasets', id, 'name') as string,
  }))

  return (
    <Dropdown
      value={activeDatasetId}
      options={datasets}
      optionLabel="name"
      optionValue="id"
      onChange={(e: DropdownChangeEvent) => onSelect(e.value)}
      placeholder={t('dataset.selector.label')}
      className="w-auto"
    />
  )
}
