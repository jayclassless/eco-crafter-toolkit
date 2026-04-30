import { Menu } from 'primereact/menu'
import type { MenuItem } from 'primereact/menuitem'
import { useTranslation } from 'react-i18next'

interface Props {
  onSelectGameNews: () => void
  onSelectDatasets: () => void
  onSelectUiSettings: () => void
  onSelectAbout: () => void
}

export function SidebarMenuView({
  onSelectGameNews,
  onSelectDatasets,
  onSelectUiSettings,
  onSelectAbout,
}: Props) {
  const { t } = useTranslation()

  const items: MenuItem[] = [
    {
      label: t('settings.menu.gameNews'),
      icon: 'pi pi-megaphone',
      command: onSelectGameNews,
    },
    {
      label: t('settings.menu.datasets'),
      icon: 'pi pi-database',
      command: onSelectDatasets,
    },
    {
      label: t('settings.menu.uiSettings'),
      icon: 'pi pi-cog',
      command: onSelectUiSettings,
    },
    {
      label: t('settings.menu.about'),
      icon: 'pi pi-info-circle',
      command: onSelectAbout,
    },
  ]

  return <Menu model={items} className="w-full border-none" />
}
