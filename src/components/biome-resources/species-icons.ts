import type { BiomeFauna, BiomeSpecies } from './biome-resources-types'

function toIconBase(displayName: string): string {
  return displayName.replace(/[^A-Za-z]/g, '')
}

// Species whose display name maps directly to an inventory item icon
// (<Name>Item exists in public/eco-icons/items).
const SPECIES_ITEM = new Set([
  'Beans',
  'Clam',
  'Corn',
  'Daisy',
  'Kelp',
  'Lupine',
  'Orchid',
  'Papaya',
  'Pineapple',
  'Pumpkin',
  'Rice',
  'Sunflower',
  'Tulip',
  'Urchin',
  'Wheat',
])

// Fiber-only species with a species-specific seed item icon (<Name>SeedItem
// exists). Only species whose every yield is Plant Fibers can reach the seed
// branch, so the list holds just those.
const SPECIES_SEED = new Set([
  'Arctic Willow',
  'Barrel Cactus',
  'Big Bluestem',
  'Bullrush',
  'Bunchgrass',
  'Dwarf Willow',
  'Heliconia',
  'Jointfir',
  'Ocean Spray',
  'Saxifrage',
  'Seagrass',
  'Waterweed',
  'White Bursage',
])

// Resolution order: the species' own inventory item (Wheat, Pumpkin, ...),
// else its first non-generic yield (trees show their log, Rose Bush its
// Rose), else its seed item (fiber-only grasses like Big Bluestem), else the
// Plant Fibers yield — honest for the likes of Switchgrass, which yields
// nothing else. The two lists are explicit because icon existence can't be
// predicted from the name (checked against public/eco-icons/items); every
// yield in the atlas has an item icon.
export function speciesIconName(species: BiomeSpecies): string | null {
  const base = toIconBase(species.name)
  if (SPECIES_ITEM.has(species.name)) return `${base}Item`
  const nonGenericYield = species.yields.find((y) => y !== 'Plant Fibers')
  if (nonGenericYield) return `${toIconBase(nonGenericYield)}Item`
  if (SPECIES_SEED.has(species.name)) return `${base}SeedItem`
  if (species.yields.length === 0) return null
  return `${toIconBase(species.yields[0])}Item`
}

// Fish and shellfish are inventory items themselves; land animals only have a
// carcass item. Explicit lists (checked against public/eco-icons/items)
// because the pattern can't be derived from the name alone.
const FAUNA_ITEM = new Set([
  'Bass',
  'Blue Shark',
  'Cod',
  'Moon Jellyfish',
  'Pacific Sardine',
  'Salmon',
  'Trout',
  'Tuna',
])

const FAUNA_CARCASS = new Set([
  'Agouti',
  'Alligator',
  'Bison',
  'Coyote',
  'Crab',
  'Deer',
  'Elk',
  'Fox',
  'Hare',
  'Jaguar',
  'Mountain Goat',
  'Otter',
  'Prairie Dog',
  'Snapping Turtle',
  'Turkey',
  'Wolf',
])

// Animals whose dropped item doesn't follow <Name>CarcassItem: Bighorn Sheep's
// carcass drops the qualifier, and Tortoise is the one species that skips the
// carcass layer entirely, yielding RawMeatItem straight from its ResourceList.
const FAUNA_SPECIAL: Record<string, string> = {
  'Bighorn Sheep': 'BighornCarcassItem',
  Tortoise: 'RawMeatItem',
}

export function faunaIconName(fauna: BiomeFauna): string | null {
  if (FAUNA_SPECIAL[fauna.name]) return FAUNA_SPECIAL[fauna.name]
  if (FAUNA_ITEM.has(fauna.name)) return `${toIconBase(fauna.name)}Item`
  if (FAUNA_CARCASS.has(fauna.name)) return `${toIconBase(fauna.name)}CarcassItem`
  return null
}
