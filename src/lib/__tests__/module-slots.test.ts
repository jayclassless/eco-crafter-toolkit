import { describe, expect, it } from 'vitest'

import { deriveTableModuleSlots, MODULE_SLOT_ORDER } from '../module-slots'
import type { ModuleSlot } from '../normalize-module-bonuses'

function mod(id: string, slot: ModuleSlot, isDeprecated = false) {
  return { id, slot, isDeprecated }
}

describe('deriveTableModuleSlots', () => {
  it('derives exactly one Specialty slot for a legacy table', () => {
    // Every v11-v13 module normalizes to Specialty, so a legacy table derives
    // one slot and the popover renders the single dropdown it always had. This
    // is what keeps the module UI free of version checks.
    const slots = deriveTableModuleSlots([
      mod('m1', 'Specialty'),
      mod('m2', 'Specialty'),
      mod('m3', 'Specialty'),
    ])
    expect(slots).toHaveLength(1)
    expect(slots[0].slot).toBe('Specialty')
    expect(slots[0].candidates.map((c) => c.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('orders slots by the game core-slot order, not by input order', () => {
    const slots = deriveTableModuleSlots([
      mod('spec', 'Specialty'),
      mod('modern', 'Modern'),
      mod('basic', 'Basic'),
      mod('adv', 'Advanced'),
    ])
    expect(slots.map((s) => s.slot)).toEqual([...MODULE_SLOT_ORDER])
  })

  it('omits slots the table exposes no module for', () => {
    // Not every v14 table exposes all four — e.g. two derive [Modern,
    // Specialty] and one derives [Basic, Advanced, Modern]. Rendering a fixed
    // four-row popover would offer slots those tables do not have.
    const slots = deriveTableModuleSlots([mod('modern', 'Modern'), mod('spec', 'Specialty')])
    expect(slots.map((s) => s.slot)).toEqual(['Modern', 'Specialty'])
  })

  it('attaches the slot star cost, with Specialty free', () => {
    const slots = deriveTableModuleSlots([
      mod('basic', 'Basic'),
      mod('adv', 'Advanced'),
      mod('modern', 'Modern'),
      mod('spec', 'Specialty'),
    ])
    expect(slots.map((s) => s.starCost)).toEqual([1, 1, 1, 0])
  })

  it('drops deprecated modules', () => {
    // No player can obtain one, and 10 of v14's deprecated modules are
    // Specialty duplicates of live ones — listing them would offer the same
    // upgrade twice with different values.
    const slots = deriveTableModuleSlots([mod('live', 'Specialty'), mod('dead', 'Specialty', true)])
    expect(slots[0].candidates.map((c) => c.id)).toEqual(['live'])
  })

  it('does not conjure a slot from deprecated modules alone', () => {
    // Real case: in Eco 14.0.1 the Anvil, Blast Furnace and Bloomery each
    // offered exactly one Specialty module — the deprecated
    // `SmeltingBasicUpgradeItem` — so their Specialty slot had no obtainable
    // option and must not be rendered. 14.0.2 fixed those three to point at the
    // live module, but the guard stays: nothing stops it recurring.
    expect(deriveTableModuleSlots([mod('dead', 'Basic', true)])).toEqual([])
  })

  it('returns no slots for a table that accepts no modules', () => {
    // Three v14 mining tables (Arrastra, Jaw Crusher, Stamp Mill) lost their
    // module slots entirely; the cell renders "N/A" for these.
    expect(deriveTableModuleSlots([])).toEqual([])
  })
})
