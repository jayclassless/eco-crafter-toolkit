import { Tooltip } from 'primereact/tooltip'
import { memo, type MouseEvent as ReactMouseEvent } from 'react'
import type { Store } from 'tinybase'

import { EcoIcon } from '@/components/common/EcoIcon'
import { useCellValue } from '@/hooks/use-store-revision'

import type { TalentRow } from './skills-types'

interface Props {
  buildStore: Store
  talent: TalentRow
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}

// Subscribes to its own userTalents.enabled cell so toggling one talent only
// re-renders this single chip.
export const TalentChip = memo(function TalentChip({
  buildStore,
  talent,
  onToggle,
  onSetLevel,
}: Props) {
  const enabled =
    useCellValue<boolean>(buildStore, 'userTalents', talent.userTalentId, 'enabled') ?? false
  const talentLevel =
    useCellValue<number>(buildStore, 'userTalents', talent.userTalentId, 'talentLevel') ?? 0
  const tooltipClass = `talent-tooltip-${talent.id.replace(/[^a-zA-Z0-9]/g, '')}`

  const isLevelable = talent.isLevelable
  const active = isLevelable ? talentLevel > 0 : enabled
  const tooltipContent = isLevelable
    ? `${talent.name} (level ${talentLevel}/${talent.maxTalentLevel})\n\n(click to increase, shift/right-click to decrease)`
    : talent.name

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
      <EcoIcon name={talent.talentGroupName} size={24} />
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
