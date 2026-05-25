import { Button } from 'primereact/button'
import { Sidebar } from 'primereact/sidebar'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarMenuView } from './SidebarMenuView'
import { UiSettingsView } from './UiSettingsView'

import './SettingsSidebar.css'

interface Props {
  visible: boolean
  onHide: () => void
  // Optional: omit in tools without an ad-hoc recipe calculator (Crop Tracker).
  onOpenRecipeCalculator?: () => void
  onOpenGameNews: () => void
  onOpenDatasets: () => void
  onOpenAbout: () => void
}

type View = 'menu' | 'uiSettings'

export function SettingsSidebar({
  visible,
  onHide,
  onOpenRecipeCalculator,
  onOpenGameNews,
  onOpenDatasets,
  onOpenAbout,
}: Props) {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('menu')

  useEffect(() => {
    if (visible) setView('menu')
  }, [visible])

  const header =
    view === 'menu' ? (
      t('settings.title')
    ) : (
      <div className="flex align-items-center gap-2">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          aria-label={t('settings.ui.back')}
          onClick={() => setView('menu')}
        />
        <span>{t('settings.ui.title')}</span>
      </div>
    )

  const handleSelectRecipeCalculator = onOpenRecipeCalculator
    ? () => {
        onHide()
        onOpenRecipeCalculator()
      }
    : undefined

  const handleSelectGameNews = () => {
    onHide()
    onOpenGameNews()
  }

  const handleSelectDatasets = () => {
    onHide()
    onOpenDatasets()
  }

  const handleSelectAbout = () => {
    onHide()
    onOpenAbout()
  }

  return (
    <Sidebar visible={visible} onHide={onHide} position="right" header={header}>
      {view === 'menu' ? (
        <SidebarMenuView
          onSelectRecipeCalculator={handleSelectRecipeCalculator}
          onSelectGameNews={handleSelectGameNews}
          onSelectDatasets={handleSelectDatasets}
          onSelectUiSettings={() => setView('uiSettings')}
          onSelectAbout={handleSelectAbout}
        />
      ) : (
        <UiSettingsView />
      )}
    </Sidebar>
  )
}
