import { Panel, type PanelHeaderTemplateOptions } from 'primereact/panel'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { bbcodeToHtml } from '@/lib/bbcode-to-html'
import type { SteamNewsItem } from '@/lib/steam-news'

import './NewsItemCard.css'

interface Props {
  item: SteamNewsItem
}

export function NewsItemCard({ item }: Props) {
  const { t } = useTranslation()
  const { formatDate } = useLocalization()
  const html = bbcodeToHtml(item.contents)
  const publishedAt = formatDate(new Date(item.date * 1000))

  // Wrap the custom header content in `options.className` so PrimeReact's
  // default panel-header background and border are preserved.
  const headerTemplate = (options: PanelHeaderTemplateOptions) => (
    <div className={options.className}>
      <div className="flex flex-column gap-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-color hover:text-primary font-bold text-lg no-underline"
        >
          {item.title}
        </a>
        <div className="text-sm text-color-secondary font-normal">
          {item.author
            ? t('gameNews.dateByAuthor', { date: publishedAt, author: item.author })
            : publishedAt}
        </div>
      </div>
    </div>
  )

  return (
    <Panel headerTemplate={headerTemplate}>
      <div
        className="game-news-body line-height-3"
        // HTML is produced by `bbcodeToHtml`, which HTML-escapes the input
        // first and then injects only a whitelisted set of tags.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Panel>
  )
}
