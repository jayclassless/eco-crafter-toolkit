type BiomeType = 'Land' | 'Coast' | 'Sea'

type RockKind = 'soil' | 'stone'

export interface BiomeSpecies {
  name: string
  locked: boolean
  yields: string[]
}

export interface BiomeFauna {
  name: string
  cat: string
  note: string
}

export interface RockLayer {
  name: string
  raw: string
  kind: RockKind
  topDepth: number
  botDepth: number
}

interface ColumnLayer {
  name: string
  raw: string
  kind: RockKind
  from: number
  to: number
}

interface OreBand {
  dmin: number
  dmax: number
  hosts: string[]
  deposit: boolean
}

export interface BiomeOre {
  name: string
  raw: string
  minDepth: number
  maxDepth: number
  surface: boolean
  onlyCrushed: boolean
  traceDeep: boolean
  maxVein: number
  guaranteed: boolean
  bands: OreBand[]
}

interface BiomeClimate {
  temp: string
  moist: string
  type: BiomeType
}

export interface Biome {
  label: string
  desc: string
  climate: BiomeClimate
  trees: BiomeSpecies[]
  harvest: BiomeSpecies[]
  fauna: BiomeFauna[]
  rocks: RockLayer[]
  column: ColumnLayer[]
  ores: BiomeOre[]
}

export interface BiomeAtlas {
  meta: {
    world: string
    waterLevel: number
    maxHeight: number
  }
  biomes: Record<string, Biome>
}
