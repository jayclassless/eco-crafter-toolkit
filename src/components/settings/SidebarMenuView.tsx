import { Badge } from 'primereact/badge'
import { Menu } from 'primereact/menu'
import type { MenuItem, MenuItemOptions } from 'primereact/menuitem'
import { Ripple } from 'primereact/ripple'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useNewsBadgeCount } from '@/hooks/use-news-badge'
import { useReleasesBadgeCount } from '@/hooks/use-releases-badge'

interface Props {
  onSelectGameNews: () => void
  onSelectDatasets: () => void
  onSelectUiSettings: () => void
  onSelectAbout: () => void
}

function badgedTemplate(count: number, format: (n: number) => string) {
  if (count <= 0) return undefined
  return (item: MenuItem, options: MenuItemOptions) => (
    <div className="p-menuitem-content">
      <a
        href="#"
        role="menuitem"
        className={`${options.className} flex align-items-center`}
        tabIndex={-1}
        aria-label={item.label}
        onClick={(e) => {
          e.preventDefault()
          options.onClick(e)
        }}
      >
        <span className={options.iconClassName} />
        <span className={options.labelClassName}>{item.label}</span>
        <Badge
          severity="danger"
          value={format(count)}
          className="ml-auto"
          style={{
            height: '1rem',
            minWidth: '1rem',
            lineHeight: '1rem',
            fontSize: '0.625rem',
          }}
        />
        <Ripple />
      </a>
    </div>
  )
}

export function SidebarMenuView({
  onSelectGameNews,
  onSelectDatasets,
  onSelectUiSettings,
  onSelectAbout,
}: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()
  const newsCount = useNewsBadgeCount()
  const releasesCount = useReleasesBadgeCount()

  const items: MenuItem[] = [
    {
      label: t('settings.menu.gameNews'),
      icon: 'pi pi-megaphone',
      command: onSelectGameNews,
      template: badgedTemplate(newsCount, formatNumber),
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
      template: badgedTemplate(releasesCount, formatNumber),
    },
  ]

  return <Menu model={items} className="w-full border-none" />
}
