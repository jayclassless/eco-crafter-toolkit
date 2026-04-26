import { Menu } from 'primereact/menu'
import type { MenuItem } from 'primereact/menuitem'
import { useTranslation } from 'react-i18next'

interface Props {
  onSelectDatasets: () => void
  onSelectUiSettings: () => void
}

export function SidebarMenuView({ onSelectDatasets, onSelectUiSettings }: Props) {
  const { t } = useTranslation()

  const items: MenuItem[] = [
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
  ]

  return <Menu model={items} className="w-full border-none" />
}
