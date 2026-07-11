import { DEPTH_CAP } from './biome-atlas'
import type { BiomeOre } from './biome-resources-types'

export interface OreBandItem {
  oreRaw: string
  oreName: string
  dmin: number
  dmax: number
  deposit: boolean
  // Synthesized from onlyCrushed ores (crushed flecks at ground level), which
  // carry no real depth bands.
  flecks: boolean
  hosts: string[]
}

export interface PackedBand extends OreBandItem {
  col: number
}

// Flatten ores into individual chart bands. An onlyCrushed ore (e.g. Tundra
// gold) has no bands and no depth range — represent it as a thin synthetic
// band at the surface so it still shows up in the cross-section.
export function buildOreBandItems(ores: BiomeOre[]): OreBandItem[] {
  const items: OreBandItem[] = []
  for (const ore of ores) {
    if (ore.onlyCrushed) {
      items.push({
        oreRaw: ore.raw,
        oreName: ore.name,
        dmin: 0,
        dmax: 2,
        deposit: false,
        flecks: true,
        hosts: [],
      })
      continue
    }
    for (const band of ore.bands) {
      items.push({
        oreRaw: ore.raw,
        oreName: ore.name,
        dmin: band.dmin,
        dmax: band.dmax,
        deposit: band.deposit,
        flecks: false,
        hosts: band.hosts,
      })
    }
  }
  items.sort((a, b) => a.dmin - b.dmin || a.dmax - b.dmax)
  return items
}

interface PackOptions {
  // Minimum rendered band height in blocks, so thin bands stay readable.
  minHeight?: number
  // Vertical breathing room in blocks required between bands in one column.
  clearance?: number
}

// Greedy column assignment: each band goes into the first column whose last
// occupant (inflated to minHeight) ends above the band's start, so overlapping
// bands render side by side instead of on top of each other.
export function packOreBands(
  items: OreBandItem[],
  { minHeight = 3.75, clearance = 0.5 }: PackOptions = {}
): { bands: PackedBand[]; columnCount: number } {
  const columnEnds: number[] = []
  const bands = items.map((item) => {
    let col = 0
    while (col < columnEnds.length && columnEnds[col] > item.dmin - clearance) col++
    columnEnds[col] = item.dmin + Math.max(minHeight, item.dmax - item.dmin)
    return { ...item, col }
  })
  return { bands, columnCount: Math.max(1, columnEnds.length) }
}

// Depth in blocks -> percent of chart height, clamped to the chart range.
export function depthToPercent(depth: number, cap: number = DEPTH_CAP): number {
  return (Math.min(Math.max(depth, 0), cap) / cap) * 100
}

export type VeinSizeKey = 'massive' | 'large' | 'medium' | 'small'

export function veinSizeKey(maxVein: number): VeinSizeKey {
  if (maxVein >= 200) return 'massive'
  if (maxVein >= 60) return 'large'
  if (maxVein >= 15) return 'medium'
  return 'small'
}

// i18n key suffixes (under biomeResources.tags.*) describing an ore's traits.
export function oreTags(ore: BiomeOre): string[] {
  if (ore.onlyCrushed) return ['surfaceFlecksOnly']
  const tags: string[] = []
  if (ore.surface) tags.push('surfaceFlecks')
  if (ore.guaranteed) tags.push('alwaysPresent')
  if (ore.maxVein > 0) tags.push(`vein.${veinSizeKey(ore.maxVein)}`)
  if (ore.traceDeep) tags.push('traceDeep')
  return tags
}
