// SVG arc geometry for the room-category donut. Pure, so the two shapes that
// break naive pie code — a zero total and a single full-circle slice — are
// covered by unit tests rather than discovered in the browser.

export interface DonutDatum {
  key: string
  /** Localized category name, for the legend and the accessible description. */
  label: string
  /** The dataset's own '#RRGGBB' for the category, or '' when it has none. */
  color: string
  value: number
}

export interface DonutSlice extends DonutDatum {
  /** Fraction of the total, 0..1. */
  share: number
  /** The wedge path, or '' when `fullCircle` is set. */
  d: string
  /** A slice covering the whole donut cannot be drawn as an arc: its start and
   * end points coincide, so the path collapses to nothing. Consumers render a
   * ring of two stroked circles instead. */
  fullCircle: boolean
}

export interface DonutOptions {
  /** Width and height of the square viewBox. */
  size: number
  /** Ring thickness, as a fraction of the radius. */
  thickness: number
}

function pointOnCircle(cx: number, cy: number, r: number, fraction: number): [number, number] {
  // Start at 12 o'clock and sweep clockwise, which is how a reader expects a
  // share chart to run.
  const angle = fraction * Math.PI * 2 - Math.PI / 2
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

/**
 * Build the wedge paths for a donut.
 *
 * Returns [] when nothing has value: dividing by a zero total would put NaN in
 * every `d` attribute, which renders as an invisible broken path with no
 * console error at all.
 */
export function buildDonutSlices(data: DonutDatum[], options: DonutOptions): DonutSlice[] {
  const positive = data.filter((d) => d.value > 0)
  let total = 0
  for (const d of positive) total += d.value
  if (total <= 0) return []

  const cx = options.size / 2
  const cy = options.size / 2
  const outer = options.size / 2
  const inner = outer * (1 - options.thickness)

  const slices: DonutSlice[] = []
  let start = 0
  for (const datum of positive) {
    const share = datum.value / total
    const end = start + share
    if (share >= 1) {
      slices.push({ ...datum, share: 1, d: '', fullCircle: true })
      start = end
      continue
    }
    const [ox1, oy1] = pointOnCircle(cx, cy, outer, start)
    const [ox2, oy2] = pointOnCircle(cx, cy, outer, end)
    const [ix2, iy2] = pointOnCircle(cx, cy, inner, end)
    const [ix1, iy1] = pointOnCircle(cx, cy, inner, start)
    const largeArc = share > 0.5 ? 1 : 0
    slices.push({
      ...datum,
      share,
      d: [
        `M ${ox1} ${oy1}`,
        `A ${outer} ${outer} 0 ${largeArc} 1 ${ox2} ${oy2}`,
        `L ${ix2} ${iy2}`,
        `A ${inner} ${inner} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' '),
      fullCircle: false,
    })
    start = end
  }
  return slices
}
