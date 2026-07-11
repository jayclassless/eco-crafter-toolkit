import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BIOME_ATLAS } from '../biome-atlas'
import { FloraFaunaCard } from '../FloraFaunaCard'

import '@/i18n'

describe('FloraFaunaCard', () => {
  it('marks locked species as biome-native and unlocked as climate-driven', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    // Beets is locked (native); Bunchgrass is not (climate-driven).
    const beets = screen.getByText('Beets').parentElement!
    expect(beets.querySelector('[title="biome-native plant"]')).not.toBeNull()
    const bunchgrass = screen.getByText('Bunchgrass').parentElement!
    expect(bunchgrass.querySelector('[title="climate-driven"]')).not.toBeNull()
  })

  it('renders yields right-aligned in each species row', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    const yields = screen.getByText('Beet, Beet Greens')
    expect(yields).toHaveClass('ml-auto')
  })

  it('sorts wildlife by name', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    // Data order is category-then-name (Turkey first); the list re-sorts by
    // name alone, putting Beaver ahead of the birds and fish.
    const names = BIOME_ATLAS.biomes.Grassland.fauna.map((f) => f.name)
    const rows = screen
      .getAllByText((_, el) => el?.tagName === 'SPAN' && names.includes(el.textContent ?? ''))
      .map((el) => el.textContent)
    expect(rows).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(rows[0]).toBe('Beaver')
  })

  it('shows the category tag for every animal, ignoring notes', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    const bison = screen.getByText('Bison').parentElement!
    expect(bison.querySelector('.p-tag')).toHaveTextContent('Mammals')
    // Salmon carries a freshwater note in the data; it is not rendered.
    const salmon = screen.getByText('Salmon').parentElement!
    expect(salmon.querySelector('.p-tag')).toHaveTextContent('Fish')
    expect(screen.queryByText('freshwater (rivers & lakes)')).not.toBeInTheDocument()
  })

  it('prefers the species item, then a non-generic yield', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    // Wheat is an inventory item itself; Cedar's non-generic yield is its log.
    // ('Wheat' also appears as its own yield text, so scope to the name span.)
    const wheat = screen.getByText('Wheat', { selector: '.font-medium' }).parentElement!
    expect(wheat.querySelector('img')?.src).toContain('/eco-icons/items/WheatItem.png')
    const cedar = screen.getByText('Cedar').parentElement!
    expect(cedar.querySelector('img')?.src).toContain('/eco-icons/items/CedarLogItem.png')
    const beets = screen.getByText('Beets').parentElement!
    expect(beets.querySelector('img')?.src).toContain('/eco-icons/items/BeetItem.png')
  })

  it('uses seed icons only for fiber-only species that have one', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    // Big Bluestem yields only Plant Fibers but has a seed item icon.
    const bluestem = screen.getByText('Big Bluestem').parentElement!
    expect(bluestem.querySelector('img')?.src).toContain('/eco-icons/items/BigBluestemSeedItem.png')
    // Switchgrass has neither, so the fibers icon is honest.
    const switchgrass = screen.getByText('Switchgrass').parentElement!
    expect(switchgrass.querySelector('img')?.src).toContain('/eco-icons/items/PlantFibersItem.png')
  })

  it('prefers a non-fibers yield for mixed-yield species (Rose Bush)', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Wetland} />)
    // Rose Bush yields Plant Fibers first, then Rose — the rose is the icon.
    const roseBush = screen.getByText('Rose Bush').parentElement!
    expect(roseBush.querySelector('img')?.src).toContain('/eco-icons/items/RoseItem.png')
  })

  it('resolves fauna icons as items, carcasses, or none', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Grassland} />)
    const salmon = screen.getByText('Salmon').parentElement!
    expect(salmon.querySelector('img')?.src).toContain('/eco-icons/items/SalmonItem.png')
    const bison = screen.getByText('Bison').parentElement!
    expect(bison.querySelector('img')?.src).toContain('/eco-icons/items/BisonCarcassItem.png')
    // Tarantula has no item or carcass icon; the row renders without an image.
    const tarantula = screen.getByText('Tarantula').parentElement!
    expect(tarantula.querySelector('img')).toBeNull()
  })

  it('renders empty states for the Ice biome', () => {
    render(<FloraFaunaCard biome={BIOME_ATLAS.biomes.Ice} />)
    // Trees and plants both fall back to "None."
    expect(screen.getAllByText('None.')).toHaveLength(2)
    expect(screen.getByText('No wildlife spawns here.')).toBeInTheDocument()
  })
})
