import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'

import { ORE_COLOR, ROCK_COLOR } from './biome-atlas'
import type { Biome } from './biome-resources-types'
import {
  buildOreBandItems,
  depthToPercent,
  packOreBands,
  type PackedBand,
} from './cross-section-layout'

import './CrossSectionChart.css'

interface Props {
  biome: Biome
}

const RULER_DEPTHS = [0, 20, 40, 60, 80, 100]

// Horizontal geometry of the ore lane, in rem: lane padding on each side and
// the gap between packed columns. Column widths are percent-based via calc().
const LANE_LEFT = 0.5
const LANE_RIGHT = 0.375
const COLUMN_GAP = 0.25

// Bands shorter than this render at this height so labels stay legible; the
// packing algorithm uses the same minimum (as blocks) when assigning columns.
const MIN_BAND_HEIGHT_BLOCKS = 3.75

function bandLabel(
  band: PackedBand,
  columnCount: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (band.flecks) return t('biomeResources.chart.flecksLabel', { name: band.oreName })
  const depths = `${band.dmin}–${band.dmax}`
  return columnCount >= 3 ? depths : `${band.oreName} ${depths}`
}

function bandTooltip(
  band: PackedBand,
  t: (key: string, options?: Record<string, unknown>) => string,
  formatList: (values: readonly string[]) => string
): string {
  if (band.flecks) return t('biomeResources.chart.tooltipFlecks', { name: band.oreName })
  return t('biomeResources.chart.tooltip', {
    name: band.oreName,
    min: band.dmin,
    max: band.dmax,
    kind: t(band.deposit ? 'biomeResources.chart.depositVein' : 'biomeResources.chart.seam'),
    hosts: formatList(band.hosts),
  })
}

// Vertical cross-section of the biome's underground: the simplified strata
// column on the left, ore depth bands packed into side-by-side columns on the
// right, against a 0-100 blocks-below-surface ruler.
export function CrossSectionChart({ biome }: Props) {
  const { t } = useTranslation()
  const { formatList } = useLocalization()
  const { bands, columnCount } = useMemo(
    () => packOreBands(buildOreBandItems(biome.ores), { minHeight: MIN_BAND_HEIGHT_BLOCKS }),
    [biome]
  )

  // Total non-flexible width in the ore lane; each column gets an equal share
  // of the remainder.
  const fixedRem = LANE_LEFT + LANE_RIGHT + (columnCount - 1) * COLUMN_GAP
  const columnWidth = `calc((100% - ${fixedRem}rem) / ${columnCount})`

  return (
    <div className="cross-section-chart">
      <div className="cross-section-ruler">
        {RULER_DEPTHS.map((depth) => (
          <span key={depth} style={{ top: `${depthToPercent(depth)}%` }}>
            {depth === 100 ? '100+' : depth}
          </span>
        ))}
      </div>
      <div className="cross-section-plot">
        <div className="cross-section-strata">
          {biome.column.map((layer) => (
            <div
              key={`${layer.raw}-${layer.from}`}
              className="cross-section-stratum"
              style={{
                top: `${depthToPercent(layer.from)}%`,
                height: `${depthToPercent(layer.to) - depthToPercent(layer.from)}%`,
                background: ROCK_COLOR[layer.raw] ?? '#888',
              }}
            >
              {layer.to - layer.from > 4 && <span>{layer.name}</span>}
            </div>
          ))}
        </div>
        <div className="cross-section-ore-lane">
          {bands.map((band, i) => (
            <div
              key={i}
              className={
                'cross-section-ore-band' +
                (band.deposit ? ' cross-section-ore-band--deposit' : '') +
                (band.flecks ? ' cross-section-ore-band--flecks' : '')
              }
              style={{
                top: `${depthToPercent(band.dmin)}%`,
                height: `${Math.max(MIN_BAND_HEIGHT_BLOCKS, band.dmax - band.dmin)}%`,
                width: columnWidth,
                left: `calc(${LANE_LEFT}rem + ${band.col} * (${columnWidth} + ${COLUMN_GAP}rem))`,
                backgroundColor: ORE_COLOR[band.oreRaw],
              }}
              title={bandTooltip(band, t, formatList)}
            >
              <span>{bandLabel(band, columnCount, t)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
