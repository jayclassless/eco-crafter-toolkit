import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'

import { buildDonutSlices, type DonutDatum } from './housing-donut-layout'

interface Props {
  data: DonutDatum[]
}

const SIZE = 200
const THICKNESS = 0.42

// Relative contribution of each room category, as a donut plus a legend.
//
// Hand-rolled rather than pulled from a charting library: there are at most a
// handful of slices, and the fills are the game's own category colors, so a
// dependency would buy nothing.
//
// The legend carries the real names and numbers, so the chart is redundant
// rather than the only way to read the data.
function CategoryDonutImpl({ data }: Props) {
  const { t } = useTranslation()
  const { formatNumber, formatPercent } = useLocalization()
  const slices = useMemo(() => buildDonutSlices(data, { size: SIZE, thickness: THICKNESS }), [data])

  if (slices.length === 0) return null

  const radius = SIZE / 2
  const innerRadius = radius * (1 - THICKNESS)
  // Stroke sits astride the path, so the ring's mid-radius carries it.
  const ringRadius = (radius + innerRadius) / 2
  const ringWidth = radius - innerRadius

  return (
    <div className="flex align-items-center gap-4 flex-wrap">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={t('housingScore.optimizer.byCategory')}
        style={{ flex: '0 0 auto' }}
      >
        <title>{t('housingScore.optimizer.byCategory')}</title>
        {slices.map((slice) =>
          slice.fullCircle ? (
            <circle
              key={slice.key}
              cx={radius}
              cy={radius}
              r={ringRadius}
              fill="none"
              // A lone slice covers the whole ring; an arc would collapse to
              // nothing because its endpoints coincide.
              stroke={slice.color || 'var(--surface-500)'}
              strokeWidth={ringWidth}
            />
          ) : (
            <path
              key={slice.key}
              d={slice.d}
              // Categories without a color of their own fall back to a theme
              // variable rather than getting an invented hue.
              fill={slice.color || 'var(--surface-500)'}
              // Separator drawn in the card color so wedges read apart in both
              // light and dark themes.
              stroke="var(--surface-card)"
              strokeWidth={2}
            />
          )
        )}
      </svg>

      <ul className="list-none p-0 m-0 flex flex-column gap-2" style={{ minWidth: '14rem' }}>
        {slices.map((slice) => (
          <li key={slice.key} className="flex align-items-center gap-2">
            <span
              aria-hidden="true"
              style={{
                width: '0.75rem',
                height: '0.75rem',
                borderRadius: '2px',
                flex: '0 0 auto',
                background: slice.color || 'var(--surface-500)',
              }}
            />
            {/* The swatch already carries the category color, so the name is
                left in the default text color. Several of the game's category
                colors (Bathroom is #A6E1EA) are near-illegible as text on a
                light background. */}
            <span className="flex-1">{slice.label}</span>
            <span className="font-medium">
              {formatNumber(slice.value, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-color-secondary text-sm">
              {t('housingScore.optimizer.share', {
                percent: formatPercent(slice.share, { maximumFractionDigits: 0 }),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const CategoryDonut = memo(CategoryDonutImpl)
