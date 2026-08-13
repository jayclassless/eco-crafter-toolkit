import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BIOME_ATLAS } from '../biome-atlas'
import { CrossSectionChart } from '../CrossSectionChart'

import '@/i18n'

describe('CrossSectionChart', () => {
  it('renders strata, ore bands and ruler ticks for Grassland', () => {
    const { container } = render(<CrossSectionChart biome={BIOME_ATLAS.biomes.Grassland} />)
    expect(container.querySelectorAll('.cross-section-stratum')).toHaveLength(4)
    expect(screen.getByText('Rocky Soil')).toBeInTheDocument()
    // Sulfur 2 bands + Coal 3 + Iron 1.
    expect(container.querySelectorAll('.cross-section-ore-band')).toHaveLength(6)
    expect(container.querySelectorAll('.cross-section-ruler span')).toHaveLength(6)
    expect(screen.getByText('100+')).toBeInTheDocument()
  })

  it('marks deposit bands with the hatch class', () => {
    const { container } = render(<CrossSectionChart biome={BIOME_ATLAS.biomes.Grassland} />)
    // Only the iron 53-60 band is a deposit vein in Grassland.
    expect(container.querySelectorAll('.cross-section-ore-band--deposit')).toHaveLength(1)
  })

  it('synthesizes a surface flecks band for onlyCrushed ores (Tundra gold)', () => {
    const { container } = render(<CrossSectionChart biome={BIOME_ATLAS.biomes.Tundra} />)
    const flecks = container.querySelector('.cross-section-ore-band--flecks')
    expect(flecks).not.toBeNull()
    expect(flecks).toHaveTextContent('Gold Ore flecks')
  })

  it('joins multiple host rocks in the tooltip as a localized list', () => {
    const { container } = render(<CrossSectionChart biome={BIOME_ATLAS.biomes.Wetland} />)
    // Wetland's 8–24 coal deposit is hosted in both Dirt and Shale.
    const band = [...container.querySelectorAll('.cross-section-ore-band')].find((el) =>
      el.getAttribute('title')?.includes('8–24')
    )
    expect(band).toHaveAttribute('title', 'Coal · 8–24 deep · deposit vein in Dirt and Shale')
  })

  it('renders strata but no ore bands for Ocean', () => {
    const { container } = render(<CrossSectionChart biome={BIOME_ATLAS.biomes.Ocean} />)
    expect(container.querySelectorAll('.cross-section-stratum')).toHaveLength(2)
    expect(container.querySelectorAll('.cross-section-ore-band')).toHaveLength(0)
  })
})
