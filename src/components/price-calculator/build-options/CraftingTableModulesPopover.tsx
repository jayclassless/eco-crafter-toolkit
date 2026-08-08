import { Checkbox } from 'primereact/checkbox'
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { OverlayPanel } from 'primereact/overlaypanel'
import { memo, type MouseEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { PluginModuleIcon } from '@/components/common/PluginModuleIcon'
import { useOverlayScrollDismiss } from '@/hooks/use-overlay-scroll-dismiss'
import type { SlotSelection } from '@/lib/module-slots'
import type { ModuleSlot } from '@/types/game-data'

import type { ModuleCandidate, ModuleSlotRow } from './crafting-table-modules-types'

interface Props {
  op: RefObject<OverlayPanel | null>
  /** One row per slot the table exposes, already ordered and localized. */
  slots: ModuleSlotRow[]
  /** Currently installed module id per slot; '' or absent means empty. */
  selected: SlotSelection
  onSelect: (slot: ModuleSlot, pluginModuleId: string) => void
  /** Disambiguates checkbox DOM ids when several tables are on screen at once. */
  idPrefix: string
}

const moduleItemTemplate = (opt: unknown) => {
  const o = opt as ModuleCandidate
  // The synthetic "None" option at the top of the list has no icon.
  if (!o.id) return <span className="text-color-secondary">{o.name}</span>
  return (
    <div className="flex align-items-center gap-2">
      <PluginModuleIcon module={{ name: o.rawName }} />
      <span>{o.name}</span>
    </div>
  )
}

// The module picker itself: one row per slot the crafting table exposes.
//
// Installing a module is PERMANENT in game (verified on a live v14 server), but
// these controls are deliberately reversible. This is a planning tool, and its
// whole purpose is comparing table configurations before spending the stars, so
// a one-way control would make it unusable for the decision it exists to
// support. The permanence is surfaced as information instead — the per-slot star
// cost below, the header tooltip, and the build's star total.
export const CraftingTableModulesPopover = memo(function CraftingTableModulesPopover({
  op,
  slots,
  selected,
  onSelect,
  idPrefix,
}: Props) {
  const { t } = useTranslation()
  const dismiss = useOverlayScrollDismiss(op)

  // PrimeReact's OverlayPanel flags itself "panel-clicked" on every mousedown /
  // click inside its content, and that flag makes it swallow the FIRST outside
  // click that follows. Because this popover stays open on interaction (it's a
  // multi-slot configurator, not a one-shot menu), toggling a checkbox left the
  // flag stuck set, so the panel then needed TWO outside clicks to close. Stop
  // content interactions from reaching that internal handler so a single
  // outside click always dismisses the panel.
  //
  // Clicks inside the slot Dropdown are deliberately let through: there the flag
  // is load-bearing. The dropdown's list renders in the document body — i.e.
  // "outside" the panel — and the flag is what keeps the panel open while the
  // user picks from it.
  const stopStickyPanelClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.p-dropdown')) return
    e.stopPropagation()
  }

  return (
    <OverlayPanel ref={op} onShow={dismiss.onShow} onHide={dismiss.onHide}>
      <div
        className="flex flex-column gap-2"
        style={{ minWidth: '16rem' }}
        onClick={stopStickyPanelClick}
        onMouseDown={stopStickyPanelClick}
      >
        <div className="font-medium" title={t('priceCalculator.config.modulesPermanentTooltip')}>
          {t('priceCalculator.config.modulesTitle')}
          <i
            className="pi pi-info-circle ml-2 text-color-secondary"
            style={{ fontSize: '0.8em' }}
          />
        </div>
        {slots.map((row) => {
          const slotLabel = t(`priceCalculator.config.moduleSlot${row.slot}`)
          // A slot with a single candidate — every v14 Basic/Advanced/Modern
          // slot, on every table that exposes one — needs no dropdown. Keyed off
          // the candidate COUNT rather than the slot name so a future dataset
          // offering two Basic modules degrades into a dropdown instead of
          // silently hiding one. No legacy table is affected: every v11–v13
          // table with modules lists at least five, all Specialty.
          const single = row.candidates.length === 1 ? row.candidates[0] : null
          return (
            <div key={row.slot} className="flex align-items-center gap-2">
              <span className="text-color-secondary" style={{ width: '5.5rem' }}>
                {slotLabel}
              </span>
              {/* Specialty costs 0 stars, so its chip is left blank rather than
                  rendered as a distracting "0". */}
              <span className="text-color-secondary" style={{ width: '2.5rem' }}>
                {row.starCost > 0 && (
                  <>
                    <i className="pi pi-star-fill mr-1" style={{ color: 'var(--yellow-500)' }} />
                    {row.starCost}
                  </>
                )}
              </span>
              <div className="flex-grow-1">
                {single ? (
                  <div className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={`${idPrefix}-${row.slot}`}
                      checked={selected[row.slot] === single.id}
                      onChange={(e) => onSelect(row.slot, e.checked ? single.id : '')}
                    />
                    <label
                      htmlFor={`${idPrefix}-${row.slot}`}
                      className="flex align-items-center gap-2 cursor-pointer"
                    >
                      <PluginModuleIcon module={{ name: single.rawName }} />
                      <span>{single.name}</span>
                    </label>
                  </div>
                ) : (
                  <Dropdown
                    value={selected[row.slot] || ''}
                    options={[{ id: '', name: t('common.none'), rawName: '' }, ...row.candidates]}
                    optionLabel="name"
                    optionValue="id"
                    onChange={(e: DropdownChangeEvent) => onSelect(row.slot, e.value ?? '')}
                    itemTemplate={moduleItemTemplate}
                    className="w-full"
                    ariaLabel={slotLabel}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </OverlayPanel>
  )
})
