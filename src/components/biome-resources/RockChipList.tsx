import { useTranslation } from 'react-i18next'

import { ROCK_COLOR } from './biome-atlas'
import type { RockLayer } from './biome-resources-types'

interface Props {
  rocks: RockLayer[]
}

// One chip per excavatable layer. No EcoIcon here: several soils (Rocky Soil,
// Desert Sand, Wetland Soil, Ice) have no item icon, and the color square is
// the useful mark anyway — it keys the chip to the strata column.
export function RockChipList({ rocks }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-2">
      {rocks.map((rock) => (
        <span
          key={rock.raw}
          className="inline-flex align-items-center gap-2 text-sm px-2 py-1 border-round"
          style={{ border: '1px solid var(--surface-border)' }}
        >
          <span
            className="flex-none border-round-sm"
            style={{
              width: '0.65rem',
              height: '0.65rem',
              background: ROCK_COLOR[rock.raw] ?? '#888',
            }}
          />
          {rock.name}
          <span className="text-xs text-color-secondary">
            {t(
              rock.kind === 'soil'
                ? 'biomeResources.belowSurface.dig'
                : 'biomeResources.belowSurface.mine'
            )}
          </span>
        </span>
      ))}
    </div>
  )
}
