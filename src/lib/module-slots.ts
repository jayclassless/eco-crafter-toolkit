import { MODULE_SLOT_STAR_COSTS } from './game-constants'
import type { ModuleSlot } from './normalize-module-bonuses'

/**
 * Slot → the `userCraftingTables` cell that holds the installed module's id.
 *
 * v14 gives a crafting table up to four core slots. These are flat cells rather
 * than a join table so the row shape — and every existing read/write path —
 * stays intact.
 *
 * `Specialty` is the slot every v11–v13 module normalizes to, so a legacy build
 * uses `specialtyModuleId` alone and behaves exactly as it did before v14. It is
 * also where the pre-v14 `pluginModuleId` cell migrates to (see
 * `createPersistedBuildStore`).
 */
export const MODULE_SLOT_CELLS = {
  Basic: 'basicModuleId',
  Advanced: 'advancedModuleId',
  Modern: 'modernModuleId',
  Specialty: 'specialtyModuleId',
} as const satisfies Record<ModuleSlot, string>

export type ModuleSlotCell = (typeof MODULE_SLOT_CELLS)[ModuleSlot]

export const MODULE_SLOT_CELL_LIST: readonly ModuleSlotCell[] = [
  MODULE_SLOT_CELLS.Basic,
  MODULE_SLOT_CELLS.Advanced,
  MODULE_SLOT_CELLS.Modern,
  MODULE_SLOT_CELLS.Specialty,
]

/** Cell → slot, paired with `MODULE_SLOT_CELL_LIST` by index. Star cost is a
 * property of the SLOT a module occupies, so it is read from the cell rather
 * than from the installed module's own `slot` value — the two always agree, but
 * the cell is authoritative and needs no game-data lookup. */
export const MODULE_SLOT_BY_CELL: Readonly<Record<ModuleSlotCell, ModuleSlot>> = {
  basicModuleId: 'Basic',
  advancedModuleId: 'Advanced',
  modernModuleId: 'Modern',
  specialtyModuleId: 'Specialty',
}

/** Display order, matching the game's `ModuleSlotRegistry.CoreSlots`. */
export const MODULE_SLOT_ORDER: readonly ModuleSlot[] = ['Basic', 'Advanced', 'Modern', 'Specialty']

/** Which module (if any) occupies each slot, keyed by slot. */
export type SlotSelection = Partial<Record<ModuleSlot, string>>

export interface TableModuleSlot<T> {
  slot: ModuleSlot
  /** Stars charged to install a module here — 0 for Specialty. */
  starCost: number
  /** Non-deprecated modules the table accepts in this slot, caller-ordered. */
  candidates: T[]
}

/**
 * Derive the slots a crafting table exposes from the modules it accepts.
 *
 * This is what keeps the module UI version-agnostic: there is no table→slot
 * wiring in the dataset (it lives in the game's compiled `ModuleSlotRegistry`),
 * so the slot set is inferred from the candidates. A v11–v13 dataset normalizes
 * every module to Specialty, so every legacy table derives exactly
 * `['Specialty']` and renders the single dropdown it always did — with no
 * version branch anywhere.
 *
 * Deprecated modules are dropped: no player can obtain one, and counting them
 * would conjure a slot the table does not really expose. Verified against the
 * generated `eco-v14.json`: 57 of 68 tables accept modules and **none of them
 * derives an empty slot set** (52 expose all four, the other 5 expose two or
 * three) — pinned in `bundled-data.test.ts`, because an empty set here would
 * render a popover with no rows.
 */
export function deriveTableModuleSlots<T extends { slot: ModuleSlot; isDeprecated: boolean }>(
  modules: readonly T[]
): TableModuleSlot<T>[] {
  const bySlot = new Map<ModuleSlot, T[]>()
  for (const m of modules) {
    if (m.isDeprecated) continue
    let list = bySlot.get(m.slot)
    if (!list) {
      list = []
      bySlot.set(m.slot, list)
    }
    list.push(m)
  }
  return MODULE_SLOT_ORDER.filter((slot) => bySlot.has(slot)).map((slot) => ({
    slot,
    starCost: MODULE_SLOT_STAR_COSTS[slot],
    candidates: bySlot.get(slot)!,
  }))
}
