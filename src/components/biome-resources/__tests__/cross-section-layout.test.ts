import { describe, expect, it } from 'vitest'

import { BIOME_ATLAS } from '../biome-atlas'
import type { BiomeOre } from '../biome-resources-types'
import {
  buildOreBandItems,
  depthToPercent,
  oreTags,
  packOreBands,
  veinSizeKey,
} from '../cross-section-layout'

function makeOre(overrides: Partial<BiomeOre>): BiomeOre {
  return {
    name: 'Test Ore',
    raw: 'TestOre',
    minDepth: 0,
    maxDepth: 10,
    surface: false,
    onlyCrushed: false,
    traceDeep: false,
    maxVein: 0,
    guaranteed: false,
    bands: [],
    ...overrides,
  }
}

describe('buildOreBandItems', () => {
  it('flattens one item per band, sorted by dmin then dmax', () => {
    const items = buildOreBandItems(BIOME_ATLAS.biomes.Grassland.ores)
    expect(items).toHaveLength(6)
    const order = items.map((i) => [i.dmin, i.dmax])
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(order).toEqual(sorted)
    expect(items[0]).toMatchObject({ oreName: 'Sulfur', dmin: 1, dmax: 3, flecks: false })
  })

  it('synthesizes a surface flecks band for onlyCrushed ores with no bands', () => {
    const tundraGold = BIOME_ATLAS.biomes.Tundra.ores.find((o) => o.raw === 'GoldOre')!
    expect(tundraGold.onlyCrushed).toBe(true)
    expect(tundraGold.bands).toHaveLength(0)
    const items = buildOreBandItems([tundraGold])
    expect(items).toEqual([
      {
        oreRaw: 'GoldOre',
        oreName: 'Gold Ore',
        dmin: 0,
        dmax: 2,
        deposit: false,
        flecks: true,
        hosts: [],
      },
    ])
  })

  it('preserves deposit flags and hosts from bands', () => {
    const items = buildOreBandItems(BIOME_ATLAS.biomes.RainForest.ores)
    const shallowGold = items.find((i) => i.oreRaw === 'GoldOre' && i.dmin === 0)!
    expect(shallowGold.deposit).toBe(true)
    expect(shallowGold.hosts).toEqual(['Clay', 'Shale'])
  })

  it('returns an empty list for biomes without ores', () => {
    expect(buildOreBandItems(BIOME_ATLAS.biomes.Ocean.ores)).toEqual([])
  })
})

describe('packOreBands', () => {
  it('keeps vertically separated bands in a single column', () => {
    // Grassland: sulfur 1-3 / 8-12, coal 12-15 / 25-27 / 45-48, iron 53-60.
    // Consecutive starts always clear the previous inflated band, except the
    // 8-12 -> 12-15 pair which collides via min-height inflation.
    const { bands, columnCount } = packOreBands(
      buildOreBandItems(BIOME_ATLAS.biomes.Grassland.ores)
    )
    expect(columnCount).toBe(2)
    expect(bands.filter((b) => b.col === 1)).toHaveLength(1)
  })

  it('splits overlapping bands into separate columns', () => {
    const items = buildOreBandItems([
      makeOre({ raw: 'A', bands: [{ dmin: 10, dmax: 40, hosts: [], deposit: false }] }),
      makeOre({ raw: 'B', bands: [{ dmin: 20, dmax: 30, hosts: [], deposit: false }] }),
    ])
    const { bands, columnCount } = packOreBands(items)
    expect(columnCount).toBe(2)
    expect(bands.map((b) => b.col)).toEqual([0, 1])
  })

  it('inflates thin bands to the minimum height when packing', () => {
    // A 42-45 band occupies 42-45.75 after inflation (minHeight 3.75), so a
    // band starting at 45 must move to a second column.
    const items = buildOreBandItems([
      makeOre({ raw: 'A', bands: [{ dmin: 42, dmax: 45, hosts: [], deposit: false }] }),
      makeOre({ raw: 'B', bands: [{ dmin: 45, dmax: 80, hosts: [], deposit: false }] }),
    ])
    const { columnCount } = packOreBands(items)
    expect(columnCount).toBe(2)
  })

  it('returns at least one column for empty input', () => {
    expect(packOreBands([])).toEqual({ bands: [], columnCount: 1 })
  })
})

describe('depthToPercent', () => {
  it('maps depths linearly over the cap', () => {
    expect(depthToPercent(0)).toBe(0)
    expect(depthToPercent(50)).toBe(50)
    expect(depthToPercent(100)).toBe(100)
  })

  it('clamps out-of-range depths', () => {
    expect(depthToPercent(120)).toBe(100)
    expect(depthToPercent(-5)).toBe(0)
  })
})

describe('veinSizeKey', () => {
  it('maps vein sizes to wording buckets at the artifact thresholds', () => {
    expect(veinSizeKey(0)).toBe('small')
    expect(veinSizeKey(14)).toBe('small')
    expect(veinSizeKey(15)).toBe('medium')
    expect(veinSizeKey(59)).toBe('medium')
    expect(veinSizeKey(60)).toBe('large')
    expect(veinSizeKey(199)).toBe('large')
    expect(veinSizeKey(200)).toBe('massive')
    expect(veinSizeKey(300)).toBe('massive')
  })
})

describe('oreTags', () => {
  it('short-circuits onlyCrushed ores to the flecks-only tag', () => {
    const tundraGold = BIOME_ATLAS.biomes.Tundra.ores.find((o) => o.raw === 'GoldOre')!
    expect(oreTags(tundraGold)).toEqual(['surfaceFlecksOnly'])
  })

  it('combines surface, vein size and traceDeep for Desert iron', () => {
    const desertIron = BIOME_ATLAS.biomes.Desert.ores[0]
    expect(oreTags(desertIron)).toEqual(['surfaceFlecks', 'vein.massive', 'traceDeep'])
  })

  it('includes alwaysPresent for guaranteed ores', () => {
    const tundraSulfur = BIOME_ATLAS.biomes.Tundra.ores.find((o) => o.raw === 'Sulfur')!
    expect(oreTags(tundraSulfur)).toEqual(['alwaysPresent', 'vein.large'])
  })

  it('omits the vein tag when maxVein is zero', () => {
    const grasslandSulfur = BIOME_ATLAS.biomes.Grassland.ores.find((o) => o.raw === 'Sulfur')!
    expect(oreTags(grasslandSulfur)).toEqual(['surfaceFlecks'])
  })
})
