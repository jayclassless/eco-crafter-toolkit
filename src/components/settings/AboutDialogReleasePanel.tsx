import { Panel, type PanelHeaderTemplateOptions } from 'primereact/panel'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'

import { useLocalization } from '@/hooks/use-localization'
import type { GitHubRelease } from '@/lib/github-releases'

interface Props {
  release: GitHubRelease
}

export function AboutDialogReleasePanel({ release }: Props) {
  const { t } = useTranslation()
  const { formatDate } = useLocalization()
  const title = release.name && release.name.length > 0 ? release.name : release.tag_name
  const body = release.body.trim()

  const headerTemplate = (options: PanelHeaderTemplateOptions) => (
    <div className={options.className}>
      <div className="flex flex-column gap-1 flex-1">
        <span className="text-color font-bold text-lg">{title}</span>
        <div className="flex align-items-center gap-2 text-sm text-color-secondary font-normal">
          <span>{formatDate(new Date(release.published_at))}</span>
        </div>
      </div>
    </div>
  )

  return (
    <Panel headerTemplate={headerTemplate}>
      <div className="about-update-history-body line-height-3">
        {body.length > 0 ? (
          <ReactMarkdown>{body}</ReactMarkdown>
        ) : (
          <em className="text-color-secondary">{t('settings.about.noNotes')}</em>
        )}
      </div>
    </Panel>
  )
}
