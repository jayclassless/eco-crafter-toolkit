import { render } from '@testing-library/react'
import type { EdgeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { DepShortcutEdge } from '../DepShortcutEdge'

// `buildArcPath` is internal; we exercise it through the rendered <path>'s
// `d` attribute. BaseEdge from @xyflow/react renders the path inline in
// jsdom-compatible SVG, so reading the `d` attribute confirms the path
// shape without pulling in a full ReactFlow render.

function renderEdge(
  props: Partial<EdgeProps> & Pick<EdgeProps, 'sourceX' | 'sourceY' | 'targetX' | 'targetY'>
) {
  const merged: EdgeProps = {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourcePosition: 'right' as never,
    targetPosition: 'left' as never,
    selected: false,
    animated: false,
    interactionWidth: 0,
    ...props,
  } as EdgeProps
  return render(
    <svg>
      <DepShortcutEdge {...merged} />
    </svg>
  )
}

function parsePath(d: string): { commands: string[]; xs: number[]; ys: number[] } {
  const tokens = d.split(/\s+/).filter(Boolean)
  const commands: string[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (const t of tokens) {
    if (/^[A-Za-z]$/.test(t)) {
      commands.push(t)
      continue
    }
    // Each coordinate token is "x,y".
    const [xs0, ys0] = t.split(',')
    if (xs0 !== undefined && ys0 !== undefined) {
      xs.push(Number(xs0))
      ys.push(Number(ys0))
    }
  }
  return { commands, xs, ys }
}

describe('DepShortcutEdge', () => {
  it('renders a path starting at source and ending at target', () => {
    const { container } = renderEdge({
      sourceX: 10,
      sourceY: 50,
      targetX: 200,
      targetY: 80,
      data: { peakY: -10 },
    })
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    const d = path!.getAttribute('d') ?? ''
    const { commands, xs, ys } = parsePath(d)
    expect(commands[0]).toBe('M')
    expect(xs[0]).toBe(10)
    expect(ys[0]).toBe(50)
    // The final segment ends at the target coordinates.
    expect(xs[xs.length - 1]).toBe(200)
    expect(ys[ys.length - 1]).toBe(80)
  })

  it('routes its horizontal segment at the provided peakY', () => {
    const { container } = renderEdge({
      sourceX: 0,
      sourceY: 100,
      targetX: 300,
      targetY: 100,
      data: { peakY: 20 },
    })
    const d = container.querySelector('path')!.getAttribute('d') ?? ''
    // The path's "top" plateau y should appear somewhere — accept that the
    // numeric value 20 shows up in the d string.
    expect(d).toContain('20')
  })

  it('falls back to a lifted peak when peakY is not provided', () => {
    const { container } = renderEdge({
      sourceX: 0,
      sourceY: 100,
      targetX: 300,
      targetY: 100,
      data: undefined,
    })
    const d = container.querySelector('path')!.getAttribute('d') ?? ''
    const { ys } = parsePath(d)
    // Fallback lifts the peak 60 above min(sourceY, targetY) = 100, so 40
    // should show up.
    expect(ys.some((y) => y === 40)).toBe(true)
  })

  it('handles a back-edge (target left of source) without throwing', () => {
    const { container } = renderEdge({
      sourceX: 300,
      sourceY: 100,
      targetX: 50,
      targetY: 100,
      data: { peakY: 20 },
    })
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    const { xs } = parsePath(path!.getAttribute('d') ?? '')
    expect(xs[0]).toBe(300)
    expect(xs[xs.length - 1]).toBe(50)
  })

  it('handles target below the source (downward arc with under-peak)', () => {
    const { container } = renderEdge({
      sourceX: 0,
      sourceY: 50,
      targetX: 200,
      targetY: 50,
      data: { peakY: 150 },
    })
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    const d = path!.getAttribute('d') ?? ''
    // Plateau line below sourceY — the value 150 must appear.
    expect(d).toContain('150')
  })

  it('handles zero source-target y difference without producing NaN', () => {
    const { container } = renderEdge({
      sourceX: 0,
      sourceY: 100,
      targetX: 100,
      targetY: 100,
      data: { peakY: 100 }, // peak == both endpoints (degenerate)
    })
    const d = container.querySelector('path')!.getAttribute('d') ?? ''
    expect(d).not.toContain('NaN')
  })
})
