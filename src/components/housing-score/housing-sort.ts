import type { Compare } from '@/lib/collator'

import type {
  FurnishingRow,
  FurnishingSortField,
  HousingSortDir,
  MaterialRow,
  MaterialSortField,
} from './housing-types'

// Missing caps sort last ascending — "unknown", not "smallest". Mirrors
// crop-sort.ts's timeKey.
const capKey = (v: number | null) => (v == null ? Infinity : v)

// A null repeat reduction means "no penalty", which is the *best* case, so it
// leads ascending rather than sorting with the missing values.
const reductionKey = (v: number | null) => (v == null ? -1 : v)

function compareFurnishingField(
  a: FurnishingRow,
  b: FurnishingRow,
  field: FurnishingSortField,
  compare: Compare
): number {
  switch (field) {
    case 'name':
      return compare(a.name, b.name)
    case 'category':
      return compare(a.categoryDisplayName, b.categoryDisplayName)
    case 'type':
      return compare(a.typeForRoomLimit, b.typeForRoomLimit)
    case 'baseValue':
      return a.baseValue - b.baseValue
    case 'repeatReduction':
      return reductionKey(a.repeatReduction) - reductionKey(b.repeatReduction)
    case 'skill':
      return compare(a.skillLabel, b.skillLabel)
  }
}

function compareMaterialField(
  a: MaterialRow,
  b: MaterialRow,
  field: MaterialSortField,
  compare: Compare
): number {
  switch (field) {
    case 'name':
      return compare(a.name, b.name)
    case 'tier':
      return a.tier - b.tier
    case 'softCap':
      return capKey(a.softCap) - capKey(b.softCap)
    case 'hardCap':
      return capKey(a.hardCap) - capKey(b.hardCap)
    case 'skill':
      return compare(a.skillLabel, b.skillLabel)
  }
}

/**
 * The secondary name sort is ALWAYS ascending — note it sits outside `sign`,
 * so flipping the primary direction does not reverse tied rows. That is also
 * why this can't lean on JS sort stability plus a name pre-sort: a stable
 * pre-sort would be reversed along with the primary key.
 */
export function sortFurnishings(
  rows: FurnishingRow[],
  field: FurnishingSortField,
  dir: HousingSortDir,
  compare: Compare
): FurnishingRow[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const primary = sign * compareFurnishingField(a, b, field, compare)
    return primary !== 0 ? primary : compare(a.name, b.name)
  })
}

/** See sortFurnishings for the secondary-sort contract. */
export function sortMaterials(
  rows: MaterialRow[],
  field: MaterialSortField,
  dir: HousingSortDir,
  compare: Compare
): MaterialRow[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const primary = sign * compareMaterialField(a, b, field, compare)
    return primary !== 0 ? primary : compare(a.name, b.name)
  })
}
