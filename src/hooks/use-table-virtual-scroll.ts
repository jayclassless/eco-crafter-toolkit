import type { VirtualScrollerProps } from 'primereact/virtualscroller'
import { useMemo } from 'react'

import { useCellValue } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

/**
 * Below this row count the DataTable renders classically (no virtual
 * scroller). Small tables gain nothing from windowing, and skipping it keeps
 * edge-case behavior (empty message, tiny filtered lists) on the
 * battle-tested non-virtual path.
 */
const VIRTUAL_MIN_ROWS = 100

/**
 * Build `virtualScrollerOptions` for a PrimeReact DataTable whose rows have
 * been CSS-fixed to `rowRemHeight` rem (see the `.ect-fixed-rows-*` rules in
 * globals.css). Returns undefined for small tables — spread as
 * `virtualScrollerOptions={options}`, PrimeReact treats undefined as
 * "virtualization off".
 *
 * The virtual scroller positions rows arithmetically (index × itemSize), so
 * itemSize must match the *rendered* row height exactly or rows drift out of
 * step with the scrollbar and blank bands appear while scrolling. Row height
 * is authored in rem; the app's UI-scale setting IS the root font-size in px
 * (ThemeProvider sets `documentElement.style.fontSize = uiScale px`), so the
 * exact pixel height is rem × uiScale — recomputed reactively here whenever
 * the user changes the scale.
 */
export function useTableVirtualScroll(
  rowCount: number,
  rowRemHeight: number
): VirtualScrollerProps | undefined {
  const { uiStore } = useStores()
  const uiScale = useCellValue<number>(uiStore, 'uiState', 'main', 'uiScale') ?? 14

  return useMemo(() => {
    if (rowCount < VIRTUAL_MIN_ROWS) return undefined
    return {
      itemSize: rowRemHeight * uiScale,
      // No `delay`: PrimeReact implements it as a debounce that resets on
      // every scroll event, so continuous (trackpad/momentum) scrolling
      // starves the timer and rows stay blank until the user stops — far
      // more noticeable than the alternative. Without it the window updates
      // as you scroll: no blank rows, at the cost of one ~80–100ms render
      // per window shift (every `numToleratedItems` rows of travel). Keep
      // the overscan modest — per-shift render cost scales with the
      // rendered window, so a big buffer trades hitch frequency for hitch
      // size and loses.
      numToleratedItems: 4,
      // In virtual mode the .p-virtualscroller div (not the wrapper)
      // becomes the scroll container, but DataTable only hands it
      // `scrollHeight: 100%`, which never resolves in the flex-scrollable
      // layout — the scroller collapses to 0px and renders zero rows. The
      // wrapper is `display: flex; flex-direction: column` (PrimeReact core
      // CSS), so sizing the scroller as a stretching flex item gives it a
      // definite height without relying on the percentage chain. DataTable
      // spreads this onto the scroller element.
      style: { flex: '1 1 0', minHeight: 0, width: '100%' },
    }
  }, [rowCount, rowRemHeight, uiScale])
}
