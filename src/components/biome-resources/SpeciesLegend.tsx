import { useTranslation } from 'react-i18next'

export function SpeciesLegend() {
  const { t } = useTranslation()

  return (
    <div className="flex gap-3 flex-wrap align-items-center text-xs text-color-secondary mb-2">
      <span className="inline-flex align-items-center gap-1">
        <span
          className="border-circle"
          style={{ width: '0.5rem', height: '0.5rem', background: 'var(--primary-color)' }}
        />
        {t('biomeResources.legend.native')}
      </span>
      <span className="inline-flex align-items-center gap-1">
        <span
          className="border-circle"
          style={{
            width: '0.5rem',
            height: '0.5rem',
            boxShadow: 'inset 0 0 0 1.5px var(--text-color-secondary)',
          }}
        />
        {t('biomeResources.legend.climate')}
      </span>
    </div>
  )
}
