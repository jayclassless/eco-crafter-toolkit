import rawAtlas from './biome-atlas.json'
import type { BiomeAtlas } from './biome-resources-types'

// Static reference data describing the Eco v13 default world generator
// (Configs/WorldGenerator.eco.template). It is extracted outside this repo and
// copied in verbatim; JSON import widens union fields like `kind`/`type` to
// plain strings, hence the single cast here.
export const BIOME_ATLAS = rawAtlas as BiomeAtlas

// Biome groups for the selector; the selector alphabetizes labels within
// each group, so key order here only fixes the default biome (BIOME_KEYS[0]).
// `groupKey` indexes biomeResources.groups.* in the i18n messages.
export const BIOME_GROUPS: ReadonlyArray<{ groupKey: string; keys: string[] }> = [
  {
    groupKey: 'land',
    keys: [
      'Grassland',
      'WarmForest',
      'ColdForest',
      'RainForest',
      'Wetland',
      'Desert',
      'Taiga',
      'Tundra',
      'Ice',
    ],
  },
  { groupKey: 'coast', keys: ['WarmCoast', 'ColdCoast'] },
  { groupKey: 'sea', keys: ['Ocean', 'DeepOcean'] },
]

export const BIOME_KEYS = BIOME_GROUPS.flatMap((g) => g.keys)

// Ore colors track the active PrimeReact theme so bands adapt to light/dark.
// Two fixed exceptions: sulfur (every yellow scale step reads too close to
// gold) and coal (the Lara dark theme inverts the gray scale, turning
// --gray-700 nearly white — unreadable under the band's white label).
export const ORE_COLOR: Record<string, string> = {
  IronOre: 'var(--orange-500)',
  CopperOre: 'var(--teal-500)',
  GoldOre: 'var(--yellow-500)',
  Coal: '#4c4840',
  Sulfur: '#a99414',
}

// Fixed geology hexes (not theme vars): the colors are semantic — players
// recognize granite-gray vs sandstone-tan — and mid-tone enough to read on
// both themes, which also makes strata-label contrast knowable.
export const ROCK_COLOR: Record<string, string> = {
  Dirt: '#7c5c3c',
  RockySoil: '#8a7250',
  ForestSoil: '#6a5232',
  FrozenSoil: '#7c8892',
  WetlandsSoil: '#5c5236',
  Snow: '#dde6ea',
  Sand: '#cdb783',
  DesertSand: '#d8bd76',
  Clay: '#a76748',
  Peat: '#4c3f2d',
  Ice: '#cfe4ee',
  Sandstone: '#c5aa78',
  Limestone: '#cec6ad',
  Granite: '#9a9086',
  Basalt: '#565159',
  Shale: '#6b7069',
  Gneiss: '#8c8698',
}

export const DEPTH_CAP = 100
