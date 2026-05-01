import { Dialog } from 'primereact/dialog'
import { TabPanel, TabView } from 'primereact/tabview'
import { useTranslation } from 'react-i18next'

import { CustomItemsTab } from './CustomItemsTab'
import { CustomRecipesTab } from './CustomRecipesTab'

interface Props {
  visible: boolean
  onHide: () => void
  datasetId: string
}

export function CustomEntitiesDialog({ visible, onHide, datasetId }: Props) {
  const { t } = useTranslation()

  return (
    <Dialog
      header={t('settings.customEntities.dialogTitle')}
      visible={visible}
      onHide={onHide}
      style={{ width: '52rem' }}
      modal
      maximizable
      dismissableMask
    >
      <TabView>
        <TabPanel header={t('settings.customEntities.tabItems')}>
          {visible && <CustomItemsTab datasetId={datasetId} />}
        </TabPanel>
        <TabPanel header={t('settings.customEntities.tabRecipes')}>
          {visible && <CustomRecipesTab datasetId={datasetId} />}
        </TabPanel>
      </TabView>
    </Dialog>
  )
}
