import { Button } from 'primereact/button'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useNewsBadgeCount } from '@/hooks/use-news-badge'

export function NewsBadgeButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const count = useNewsBadgeCount()

  return (
    <Button
      icon="pi pi-megaphone"
      text
      className="ml-auto"
      tooltip={t('gameNews.openButton')}
      tooltipOptions={{ position: 'bottom' }}
      badge={count > 0 ? String(count) : undefined}
      badgeClassName="p-badge-danger"
      onClick={() => navigate('/game-news')}
      aria-label={t('gameNews.openButton')}
    />
  )
}
