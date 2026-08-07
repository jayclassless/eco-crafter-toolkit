import type { TableModuleSlot } from '@/lib/module-slots'

/** A module a table accepts in one slot, with its name already localized.
 * `rawName` is the game name the icon lookup needs. */
export interface ModuleCandidate {
  id: string
  name: string
  rawName: string
}

/** One row of the module popover: a slot the table exposes, its star cost, and
 * the modules that fit it. Built once per crafting table by the panel, then
 * shared by the cell (icons) and the popover (controls). */
export type ModuleSlotRow = TableModuleSlot<ModuleCandidate>
