import type { MarginType } from '@/types/build'

export function applyMargin(
  costPrice: number,
  marginPercent: number,
  marginType: MarginType
): number {
  if (costPrice === 0) return 0

  switch (marginType) {
    case 'markup':
      return costPrice * (1 + marginPercent / 100)
    case 'grossMargin': {
      const divisor = 1 - marginPercent / 100
      if (divisor <= 0) return Infinity
      return costPrice / divisor
    }
  }
}
