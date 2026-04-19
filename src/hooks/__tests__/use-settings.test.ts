import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { createSettings } from '../use-settings'

const BUILD_ID = 'build1'
let buildStore: Store

beforeEach(() => {
  buildStore = createBuildStore()
  buildStore.setRow('userSettings', 's1', {
    id: 's1',
    buildId: BUILD_ID,
    marginType: 'markup',
    calorieCost: 0,
    showUnskilledRecipes: false,
    onlyLevelAccessible: false,
    applyMarginBetweenSkills: false,
  })
})

const mgmt = () => createSettings(buildStore, BUILD_ID)

describe('createSettings', () => {
  it('getSettingsRowId returns the singleton row id', () => {
    expect(mgmt().getSettingsRowId()).toBe('s1')
  })

  it('setSetting updates the cell on the singleton row', () => {
    mgmt().setSetting('calorieCost', 12)
    expect(buildStore.getCell('userSettings', 's1', 'calorieCost')).toBe(12)
  })

  it('getSettingsRowId ignores rows from other builds', () => {
    buildStore.setRow('userSettings', 's-other', {
      id: 's-other',
      buildId: 'other-build',
      marginType: 'markup',
      calorieCost: 0,
      showUnskilledRecipes: false,
      onlyLevelAccessible: false,
      applyMarginBetweenSkills: false,
    })
    expect(mgmt().getSettingsRowId()).toBe('s1')
  })

  it('getSettingsRowId returns empty string when no row matches the build', () => {
    buildStore.delRow('userSettings', 's1')
    buildStore.setRow('userSettings', 's-other', {
      id: 's-other',
      buildId: 'other-build',
      marginType: 'markup',
      calorieCost: 0,
      showUnskilledRecipes: false,
      onlyLevelAccessible: false,
      applyMarginBetweenSkills: false,
    })
    expect(mgmt().getSettingsRowId()).toBe('')
  })

  it('setSetting is a no-op when no settings row exists', () => {
    buildStore.delRow('userSettings', 's1')
    mgmt().setSetting('calorieCost', 12)
    // No throw, no row created
    expect(buildStore.getRowIds('userSettings')).toHaveLength(0)
  })
})
