import { BaseEdge, type EdgeProps } from '@xyflow/react'

interface ShortcutEdgeData {
  peakY?: number
}

const APPROACH = 20
const RADIUS = 8
const FALLBACK_LIFT = 60

/**
 * Build a stepped path that exits the source rightward, climbs to `peakY`,
 * crosses to the target column, and descends into the target. The
 * horizontal segment runs at exactly `peakY`, so a peakY chosen above the
 * topmost crossed node guarantees the edge clears it. Works for forward
 * spans (source.x < target.x) and back-edges (cycles where source.x >=
 * target.x) — the cross direction is derived from the relative x.
 */
function buildArcPath(sx: number, sy: number, tx: number, ty: number, peakY: number): string {
  const x1 = sx + APPROACH
  const x2 = tx - APPROACH
  const upDir = Math.sign(peakY - sy) || -1
  const xDir = Math.sign(x2 - x1) || 1
  const downDir = Math.sign(ty - peakY) || 1

  const r = Math.max(
    0,
    Math.min(
      RADIUS,
      APPROACH - 1,
      Math.abs(sy - peakY) - 1,
      Math.abs(x2 - x1) / 2 - 1,
      Math.abs(ty - peakY) - 1
    )
  )

  return [
    `M ${sx},${sy}`,
    `L ${x1 - r},${sy}`,
    `Q ${x1},${sy} ${x1},${sy + upDir * r}`,
    `L ${x1},${peakY - upDir * r}`,
    `Q ${x1},${peakY} ${x1 + xDir * r},${peakY}`,
    `L ${x2 - xDir * r},${peakY}`,
    `Q ${x2},${peakY} ${x2},${peakY + downDir * r}`,
    `L ${x2},${ty - downDir * r}`,
    `Q ${x2},${ty} ${x2 + r},${ty}`,
    `L ${tx},${ty}`,
  ].join(' ')
}

export function DepShortcutEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const peakY =
    (data as ShortcutEdgeData | undefined)?.peakY ?? Math.min(sourceY, targetY) - FALLBACK_LIFT
  const path = buildArcPath(sourceX, sourceY, targetX, targetY, peakY)
  return (
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />
  )
}
