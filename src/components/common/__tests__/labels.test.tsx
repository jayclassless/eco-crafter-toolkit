import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PartLabel } from '../PartLabel'
import { TagLabel } from '../TagLabel'

describe('PartLabel', () => {
  it('renders the part label text and a cog icon', () => {
    const { container } = render(<PartLabel title="Required Part" />)
    expect(container.querySelector('.pi-cog')).toBeInTheDocument()
    const span = container.querySelector('span')!
    expect(span.getAttribute('title')).toBe('Required Part')
  })
})

describe('TagLabel', () => {
  it('renders the tag name and a tag icon', () => {
    const { container } = render(<TagLabel tagName="Wood" title="Wood Tag" />)
    expect(screen.getByText('Wood')).toBeInTheDocument()
    expect(container.querySelector('.pi-tag')).toBeInTheDocument()
    expect(container.querySelector('span')!.getAttribute('title')).toBe('Wood Tag')
  })
})
