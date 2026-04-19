import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { createMarginManagement } from '../use-margin-management'

const BUILD_ID = 'build1'

let buildStore: Store

type Row = Record<string, unknown> & { id: string }

function rowsForBuild(store: Store, table: string): Row[] {
  return store
    .getRowIds(table)
    .map((id): Row => ({ id, ...(store.getRow(table, id) as Record<string, unknown>) }))
    .filter((r) => r.buildId === BUILD_ID)
}

beforeEach(() => {
  buildStore = createBuildStore()
  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: 'ds1',
    name: 'T',
    createdAt: 'now',
  })
  buildStore.setRow('userMargins', 'm-default', {
    id: 'm-default',
    buildId: BUILD_ID,
    name: 'Default',
    percent: 15,
    isDefault: true,
  })
})

function mgmt() {
  return createMarginManagement(buildStore, BUILD_ID)
}

describe('createMarginManagement', () => {
  describe('createMargin', () => {
    it('creates a non-default margin with default name and percent', () => {
      const id = mgmt().createMargin()
      const row = buildStore.getRow('userMargins', id)
      expect(row.name).toBe('Margin 2')
      expect(row.percent).toBe(10)
      expect(row.isDefault).toBeFalsy()
    })
  })

  describe('createMargin', () => {
    it('honors a custom name and percent', () => {
      const id = mgmt().createMargin('Premium', 33)
      const row = buildStore.getRow('userMargins', id)
      expect(row.name).toBe('Premium')
      expect(row.percent).toBe(33)
    })

    it('ignores margins from other builds when picking the next default name', () => {
      buildStore.setRow('userMargins', 'm-foreign', {
        id: 'm-foreign',
        buildId: 'other-build',
        name: 'Foreign',
        percent: 1,
        isDefault: true,
      })
      const id = mgmt().createMargin()
      // Only the in-build "Default" counts → next index is 2
      expect(buildStore.getCell('userMargins', id, 'name')).toBe('Margin 2')
    })
  })

  describe('updateMargin', () => {
    it('updates the name field on an existing margin', () => {
      mgmt().updateMargin('m-default', 'name', 'Renamed')
      expect(buildStore.getCell('userMargins', 'm-default', 'name')).toBe('Renamed')
    })

    it('updates the percent field on an existing margin', () => {
      mgmt().updateMargin('m-default', 'percent', 33)
      expect(buildStore.getCell('userMargins', 'm-default', 'percent')).toBe(33)
    })
  })

  describe('setDefaultMargin', () => {
    it('clears the previous default and sets the new one', () => {
      const id = mgmt().createMargin('Premium', 25)
      mgmt().setDefaultMargin(id)
      expect(buildStore.getCell('userMargins', id, 'isDefault')).toBe(true)
      expect(buildStore.getCell('userMargins', 'm-default', 'isDefault')).toBe(false)
    })
  })

  describe('deleteMargin', () => {
    beforeEach(() => {
      buildStore.setRow('userMargins', 'm-other', {
        id: 'm-other',
        buildId: BUILD_ID,
        name: 'Other',
        percent: 5,
        isDefault: false,
      })
      buildStore.setRow('userRecipes', 'ur1', {
        id: 'ur1',
        buildId: BUILD_ID,
        recipeId: 'r1',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipeMargins', 'urm1', {
        id: 'urm1',
        buildId: BUILD_ID,
        userRecipeId: 'ur1',
        userMarginId: 'm-other',
      })
    })

    it('blocks deletion when only one margin remains', () => {
      buildStore.delRow('userMargins', 'm-other')
      const ok = mgmt().deleteMargin('m-default')
      expect(ok).toBe(false)
      expect(buildStore.getRow('userMargins', 'm-default').id).toBe('m-default')
    })

    it('reassigns affected recipes to the default margin', () => {
      mgmt().deleteMargin('m-other')
      expect(buildStore.getCell('userRecipeMargins', 'urm1', 'userMarginId')).toBe('m-default')
      expect(rowsForBuild(buildStore, 'userMargins').map((m) => m.id)).toEqual(['m-default'])
    })

    it('when deleting the default, promotes another margin to default', () => {
      // Move the link to the default so deletion has something to reassign
      buildStore.setCell('userRecipeMargins', 'urm1', 'userMarginId', 'm-default')
      mgmt().deleteMargin('m-default')
      expect(buildStore.getCell('userMargins', 'm-other', 'isDefault')).toBe(true)
      expect(buildStore.getCell('userRecipeMargins', 'urm1', 'userMarginId')).toBe('m-other')
    })
  })

  describe('countAffectedRecipes', () => {
    it('counts only links pointing at the given margin in this build', () => {
      buildStore.setRow('userRecipeMargins', 'urm1', {
        id: 'urm1',
        buildId: BUILD_ID,
        userRecipeId: 'ur1',
        userMarginId: 'm-default',
      })
      buildStore.setRow('userRecipeMargins', 'urm-other', {
        id: 'urm-other',
        buildId: 'other-build',
        userRecipeId: 'ur-x',
        userMarginId: 'm-default',
      })
      expect(mgmt().countAffectedRecipes('m-default')).toBe(1)
    })
  })
})
