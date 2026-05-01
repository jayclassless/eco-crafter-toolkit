import { Sidebar } from 'primereact/sidebar'
import { useTranslation } from 'react-i18next'

import { ConfigPanel } from './ConfigPanel'

interface Props {
  visible: boolean
  onHide: () => void
  buildId: string
  datasetId: string
}

export function ConfigPanelDrawer({ visible, onHide, buildId, datasetId }: Props) {
  const { t } = useTranslation()

  return (
    <Sidebar
      visible={visible}
      onHide={onHide}
      position="left"
      header={t('priceCalculator.configTitle')}
      style={{ width: 'min(420px, 90vw)' }}
      pt={{ content: { className: 'p-0' } }}
    >
      <ConfigPanel buildId={buildId} datasetId={datasetId} />
    </Sidebar>
  )
}
