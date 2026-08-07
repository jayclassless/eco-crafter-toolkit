import { Button } from 'primereact/button'
import type { OverlayPanel } from 'primereact/overlaypanel'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PluginModuleIcon } from '@/components/common/PluginModuleIcon'
import type { SlotSelection } from '@/lib/module-slots'
import type { ModuleSlot } from '@/types/game-data'

import type { ModuleSlotRow } from './crafting-table-modules-types'
import { CraftingTableModulesPopover } from './CraftingTableModulesPopover'

interface Props {
  /** Slots this table exposes, in game order. Empty means the table takes no
   * modules at all — three v14 mining tables lost their slots entirely. */
  slots: ModuleSlotRow[]
  selected: SlotSelection
  onSelect: (slot: ModuleSlot, pluginModuleId: string) => void
  idPrefix: string
}

// The Upgrade column cell: the installed modules as a row of icons, or an
// "add" affordance when every slot is empty. Either way it is the trigger for
// `CraftingTableModulesPopover`, which holds the actual controls — v14 gives a
// table up to four slots, which does not fit in a table column.
export const CraftingTableModulesCell = memo(function CraftingTableModulesCell({
  slots,
  selected,
  onSelect,
  idPrefix,
}: Props) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)

  if (slots.length === 0) {
    return (
      <span className="text-color-secondary text-center block">{t('common.notApplicable')}</span>
    )
  }

  // Icons in slot order, so a table's row stays visually stable as modules are
  // added and removed. A selection that no longer matches any candidate (a
  // dataset update that dropped the module) simply renders nothing.
  const installed = slots.flatMap((row) => {
    const id = selected[row.slot]
    const match = id ? row.candidates.find((c) => c.id === id) : undefined
    return match ? [match] : []
  })

  return (
    <>
      <Button
        text
        size="small"
        className="p-1 w-full justify-content-center"
        aria-label={t('priceCalculator.config.modulesTitle')}
        onClick={(e) => op.current?.toggle(e)}
      >
        {installed.length > 0 ? (
          <span className="flex align-items-center gap-1">
            {installed.map((m) => (
              <PluginModuleIcon key={m.id} module={{ name: m.rawName }} alt={m.name} />
            ))}
          </span>
        ) : (
          // Same min-height as an icon so the row doesn't shift when the first
          // module is installed.
          <span
            className="flex align-items-center justify-content-center text-color-secondary"
            style={{ minHeight: 24 }}
          >
            <i className="pi pi-plus" style={{ fontSize: '0.8em' }} />
          </span>
        )}
      </Button>
      <CraftingTableModulesPopover
        op={op}
        slots={slots}
        selected={selected}
        onSelect={onSelect}
        idPrefix={idPrefix}
      />
    </>
  )
})
