import type { Product, ProductGroup } from '@/hooks/use-products'

import type { Row } from './types'

/**
 * Convert sorted ProductGroups into the flat Row[] consumed by
 * ProductsDataTable. Applies the user's search and visibility filters,
 * inserts a `family` header row above any cluster of 2+ visible groups
 * sharing a recipe family, and flags clustered product/recipe rows with
 * `inFamily: true` so nameTemplate can add an extra indent step.
 *
 * Pure function — extracted from Products.tsx for unit-testing. Caller
 * (Products) memoizes the result and feeds it to ProductsDataTable.
 */
export function buildProductRows(
  groups: ProductGroup[],
  search: string,
  childVisible: (c: Product) => boolean
): Row[] {
  const q = search.trim().toLowerCase()
  const matchesSearch = (c: Product, parentName: string): boolean =>
    !q ||
    c.recipeName.toLowerCase().includes(q) ||
    c.primaryProductName.toLowerCase().includes(q) ||
    parentName.toLowerCase().includes(q)

  // Pass 1: filter each group's children. Drop groups with zero visible
  // children entirely so they don't contribute to family counts.
  interface VisibleGroup {
    group: ProductGroup
    visibleChildren: Product[]
  }
  const visible: VisibleGroup[] = []
  for (const g of groups) {
    if (g.parent) {
      const parent = g.parent
      const vc = g.children.filter(
        (c) => childVisible(c) && matchesSearch(c, parent.primaryProductName)
      )
      if (vc.length === 0) continue
      visible.push({ group: g, visibleChildren: vc })
    } else {
      const c = g.children[0]
      if (!childVisible(c)) continue
      if (!matchesSearch(c, c.primaryProductName)) continue
      visible.push({ group: g, visibleChildren: [c] })
    }
  }

  // Pass 2: count visible groups per family AND collect every visible
  // child's userRecipeId per family so the family header can drive a
  // tri-state favorite toggle across the whole cluster. Empty familyName
  // never clusters.
  const countByFamily = new Map<string, number>()
  const recipeIdsByFamily = new Map<string, string[]>()
  for (const v of visible) {
    const fn = v.group.familyName
    if (!fn) continue
    countByFamily.set(fn, (countByFamily.get(fn) ?? 0) + 1)
    let list = recipeIdsByFamily.get(fn)
    if (!list) {
      list = []
      recipeIdsByFamily.set(fn, list)
    }
    for (const c of v.visibleChildren) list.push(c.userRecipeId)
  }

  // Pass 3: emit. Track the last-emitted family so we only insert a header
  // on transitions; resetting on any non-clustered group ensures the next
  // clustered family still emits its own header.
  const out: Row[] = []
  let lastFamily = ''
  for (const v of visible) {
    const fn = v.group.familyName
    const isClustered = !!fn && (countByFamily.get(fn) ?? 0) >= 2
    if (isClustered && fn !== lastFamily) {
      out.push({
        kind: 'family',
        rowKey: `family::${fn}`,
        familyName: fn,
        childUserRecipeIds: recipeIdsByFamily.get(fn) ?? [],
      })
      lastFamily = fn
    }
    if (!isClustered) lastFamily = ''

    if (v.group.parent) {
      const parent = v.group.parent
      out.push({
        kind: 'parent',
        rowKey: `parent::${parent.primaryProductId}`,
        parent,
        childCount: v.visibleChildren.length,
        childUserRecipeIds: v.visibleChildren.map((c) => c.userRecipeId),
        inFamily: isClustered,
      })
      for (const c of v.visibleChildren) {
        out.push({
          kind: 'child',
          rowKey: `child::${parent.primaryProductId}::${c.userRecipeId}`,
          product: c,
          parent,
          inFamily: isClustered,
        })
      }
    } else {
      const c = v.visibleChildren[0]
      out.push({
        kind: 'flat',
        rowKey: `flat::${c.userRecipeId}::${c.primaryProductId}`,
        product: c,
        inFamily: isClustered,
      })
    }
  }
  return out
}
