import { useTranslation } from 'react-i18next'

import { BIOME_ATLAS } from './biome-atlas'

export function BiomeResourcesFooter() {
  const { t } = useTranslation()

  const paragraphs: Array<{ lead: string; body: string }> = [
    { lead: t('biomeResources.footer.readingLead'), body: t('biomeResources.footer.readingBody') },
    { lead: t('biomeResources.footer.plantsLead'), body: t('biomeResources.footer.plantsBody') },
    {
      lead: t('biomeResources.footer.sourceLead'),
      body: t('biomeResources.footer.sourceBody', { world: BIOME_ATLAS.meta.world }),
    },
  ]

  return (
    <div
      className="mt-4 pt-3 text-sm text-color-secondary"
      style={{ borderTop: '1px solid var(--surface-border)' }}
    >
      {paragraphs.map(({ lead, body }) => (
        <p key={lead} className="mt-0 mb-2">
          <b className="text-color">{lead}</b> {body}
        </p>
      ))}
    </div>
  )
}
