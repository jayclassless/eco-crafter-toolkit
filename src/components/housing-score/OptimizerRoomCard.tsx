import { Tooltip } from 'primereact/tooltip'
import { Fragment, memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'

import type { RoomPlan } from './housing-optimizer-types'
import { HousingItemCell } from './HousingItemCell'
import { RoomCategoryLabel } from './RoomCategoryLabel'

import './OptimizerRoomCard.css'

/** Drives the shared Tooltip below; also the hook for its hover styling. */
const ALTERNATIVES_CLASS = 'optimizer-alternatives'

interface Props {
  room: RoomPlan
  displayName: string
  color: string
  categoryLabels: Map<string, string>
}

// One room's placements.
//
// A plain table rather than a PrimeReact DataTable: these lists are short
// enough that no virtualization is needed, and DataTable has no row-grouping
// precedent in this codebase.
function OptimizerRoomCardImpl({ room, displayName, color, categoryLabels }: Props) {
  const { t } = useTranslation()
  const { formatNumber, compare } = useLocalization()
  const format = (value: number) => formatNumber(value, { maximumFractionDigits: 2 })
  const copies = room.copyContributions.length

  return (
    <div className="optimizer-room-card p-3 flex flex-column gap-2">
      <div className="flex align-items-baseline gap-2 flex-wrap">
        <span className="font-bold text-lg">
          <RoomCategoryLabel displayName={displayName} color={color} />
        </span>
        {copies > 1 && (
          <span className="text-color-secondary">
            {t('housingScore.optimizer.copies', { copies })}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-color-secondary text-sm">
          {t('housingScore.optimizer.roomValue')}
        </span>
        <span className="font-medium">{format(room.roomValue)}</span>
      </div>

      {copies > 1 && (
        // Copies of a room share a layout but NOT a value: the repeat-room
        // penalty divides by the resident count using integer division, so
        // later copies can be worth a tenth of the first. Listing them stops
        // "max rooms per category" reading as free score.
        <div className="text-color-secondary text-sm flex gap-3 flex-wrap">
          {room.copyContributions.map((value, i) => (
            <span key={i}>
              {t('housingScore.optimizer.copyLine', { index: i + 1, value: format(value) })}
            </span>
          ))}
        </div>
      )}

      <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr className="optimizer-room-rule">
            <th className="text-left font-bold pb-2">{t('housingScore.optimizer.columns.item')}</th>
            <th className="text-right font-bold pb-2" style={{ width: '4rem' }}>
              {t('housingScore.optimizer.columns.count')}
            </th>
            <th className="text-right font-bold pb-2" style={{ width: '6rem' }}>
              {t('housingScore.optimizer.columns.contribution')}
            </th>
          </tr>
        </thead>
        <tbody>
          {room.categories.map((category) => (
            <Fragment key={category.categoryName}>
              <tr className="optimizer-room-rule">
                <td colSpan={3} className="pt-3 pb-1">
                  <span className="font-medium">
                    {categoryLabels.get(category.categoryName) ?? category.categoryName}
                  </span>
                  {category.cap != null && category.rawValue > category.cap && (
                    <span className="text-color-secondary text-sm ml-2">
                      {t('housingScore.optimizer.capped')}
                    </span>
                  )}
                </td>
              </tr>
              {category.furnishings.map((f) => (
                <tr key={f.itemId}>
                  <td className="py-1">
                    <HousingItemCell
                      name={f.name}
                      rawName={f.rawName}
                      trailing={
                        f.equivalents.length > 0 && (
                          // Mechanically identical furnishings — same category,
                          // type, value and multiplier — so the player can build
                          // whichever they happen to have access to.
                          //
                          // A badge rather than a line of prose under the name:
                          // two thirds of the rows in a typical plan carry this,
                          // so a second line made every card half again as tall.
                          // The count stays glanceable and the tooltip still
                          // names them — a bare count is not actionable.
                          <span
                            className={`optimizer-alt-badge ${ALTERNATIVES_CLASS}`}
                            aria-label={t('housingScore.optimizer.alternatives', {
                              count: f.equivalents.length,
                            })}
                            data-pr-tooltip={[
                              t('housingScore.optimizer.alternativesTooltip'),
                              // Alphabetical, via the locale collator — the
                              // solver's own order is by item id, which is a
                              // uuid and so effectively arbitrary.
                              ...f.equivalents.map((alt) => alt.name).sort((a, b) => compare(a, b)),
                            ].join('\n')}
                          >
                            {t('housingScore.optimizer.alternativesBadge', {
                              count: f.equivalents.length,
                            })}
                          </span>
                        )
                      }
                    />
                  </td>
                  <td className="text-right py-1">{f.count}</td>
                  <td className="text-right py-1">{format(f.contribution)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      <Tooltip
        target={`.${ALTERNATIVES_CLASS}`}
        position="top"
        style={{ whiteSpace: 'pre-line' }}
      />
    </div>
  )
}

export const OptimizerRoomCard = memo(OptimizerRoomCardImpl)
