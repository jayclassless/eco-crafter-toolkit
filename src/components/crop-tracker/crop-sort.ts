import type { Compare } from '@/lib/collator'

export type CropSortField = 'name' | 'plant' | 'planted' | 'firstYield' | 'harvest'
export type CropSortDir = 'asc' | 'desc'

// A planting reduced to the values the field list sorts on.
export interface SortablePlanting {
  id: string
  fieldName: string // effective field label (custom name, else plant name)
  plantName: string // the crop/plant display name
  plantedAtMs: number | null // null when not yet planted
  firstYieldMs: number | null // earliest harvest returning anything; null when unplanted
  harvestMs: number | null // full yield (growth 1.0); null when unplanted
}

// Missing times sort last in ascending order (and first in descending), since
// a field with no planting/harvest is "not yet" rather than earliest.
const timeKey = (ms: number | null) => (ms == null ? Infinity : ms)

function compareField(
  a: SortablePlanting,
  b: SortablePlanting,
  field: CropSortField,
  compare: Compare
): number {
  switch (field) {
    case 'name':
      return compare(a.fieldName, b.fieldName)
    case 'plant':
      return compare(a.plantName, b.plantName)
    case 'planted':
      return timeKey(a.plantedAtMs) - timeKey(b.plantedAtMs)
    case 'firstYield':
      return timeKey(a.firstYieldMs) - timeKey(b.firstYieldMs)
    case 'harvest':
      return timeKey(a.harvestMs) - timeKey(b.harvestMs)
  }
}

// Returns a new array sorted by the given field/direction. The sort is stable,
// so fields that tie on the chosen key keep their existing relative order.
export function sortPlantings(
  items: SortablePlanting[],
  field: CropSortField,
  dir: CropSortDir,
  compare: Compare
): SortablePlanting[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...items].sort((a, b) => sign * compareField(a, b, field, compare))
}
