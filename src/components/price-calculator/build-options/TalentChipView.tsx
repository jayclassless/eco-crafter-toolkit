import { Tooltip } from 'primereact/tooltip'
import { memo, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { TalentIcon } from '@/components/common/TalentIcon'

import type { TalentRow } from './skills-types'

interface Props {
  talent: TalentRow
  enabled: boolean
  talentLevel: number
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}

// Presentational talent chip. Holds the visuals + click interactions but takes
// the enabled/level state as props, so it can be driven by the build store
// (via TalentChip) or by isolated local state (the ad-hoc recipe calculator).
export const TalentChipView = memo(function TalentChipView({
  talent,
  enabled,
  talentLevel,
  onToggle,
  onSetLevel,
}: Props) {
  const { t } = useTranslation()
  const tooltipClass = `talent-tooltip-${talent.id.replace(/[^a-zA-Z0-9]/g, '')}`

  const isLevelable = talent.isLevelable
  const active = isLevelable ? talentLevel > 0 : enabled
  const tooltipContent = [
    isLevelable
      ? t('priceCalculator.config.talentLevel', {
          name: talent.name,
          level: talentLevel,
          maxLevel: talent.maxTalentLevel,
        })
      : talent.name,
    talent.description,
    isLevelable ? t('priceCalculator.config.talentLevelHint') : undefined,
  ]
    .filter(Boolean)
    .join('\n\n')

  const handleClick = (e: ReactMouseEvent) => {
    if (isLevelable) {
      if (e.shiftKey) {
        onSetLevel(talent.id, talent.userTalentId, Math.max(0, talentLevel - 1))
      } else {
        // Wrap to 0 after max so the chip can be turned off via clicks alone.
        const next = talentLevel >= talent.maxTalentLevel ? 0 : talentLevel + 1
        onSetLevel(talent.id, talent.userTalentId, next)
      }
    } else {
      onToggle(talent.id, talent.userTalentId, !enabled)
    }
  }

  const handleContextMenu = (e: ReactMouseEvent) => {
    if (!isLevelable) return
    e.preventDefault()
    onSetLevel(talent.id, talent.userTalentId, Math.max(0, talentLevel - 1))
  }

  return (
    <div
      className={tooltipClass}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        cursor: 'pointer',
        opacity: active ? 1 : 0.3,
        transition: 'opacity 0.15s',
      }}
    >
      <TalentIcon talent={talent} size={24} />
      {isLevelable && talentLevel > 0 && (
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            background: 'var(--primary-color)',
            color: 'var(--primary-color-text)',
            borderRadius: '999px',
            fontSize: '0.6rem',
            lineHeight: 1,
            padding: '2px 4px',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {talentLevel}
        </span>
      )}
      <Tooltip
        target={`.${tooltipClass}`}
        content={tooltipContent}
        position="top"
        style={{ whiteSpace: 'pre-line' }}
      />
    </div>
  )
})
