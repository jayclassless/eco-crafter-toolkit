import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { memo, type ReactNode } from 'react'

import type { MarginOption } from '@/hooks/use-products'
import { useTableVirtualScroll } from '@/hooks/use-table-virtual-scroll'

import { MarginOptionsContext } from './MarginCell'
import type { Row } from './types'

// Every row must render at EXACTLY this height — the virtual scroller
// places rows at index × itemSize, so height drift desyncs rows from the
// scrollbar and opens blank bands. Matches the tallest natural row (the
// margin <select> rows); shorter kinds (family headers, child recipe rows)
// grow to it. Applied to every cell via `bodyStyle` below, also under the
// virtualization threshold, so row sizing doesn't shift when a table
// crosses the row-count threshold.
const ROW_REM_HEIGHT = 3.6

const CELL_STYLE = {
  height: `${ROW_REM_HEIGHT}rem`,
  paddingTop: 0,
  paddingBottom: 0,
} as const

interface Props {
  rows: Row[]
  margins: MarginOption[]
  defaultMarginId: string
  emptyMessage: string
  productHeader: string
  costHeader: string
  marginHeader: string
  saleHeader: string
  nameTemplate: (row: Row) => ReactNode
  costTemplate: (row: Row) => ReactNode
  marginTemplate: (row: Row) => ReactNode
  saleTemplate: (row: Row) => ReactNode
  actionsTemplate: (row: Row) => ReactNode
}

// Memoized DataTable host. `Products` re-renders on any `FILTER_BUILD_TABLES`
// change (e.g. a skill-level tick), but when the filter outputs are
// reference-stable via `useStableContent`, every prop here stays identical —
// so this component bails out and PrimeReact's DataTable doesn't re-invoke
// ~5 body templates × 300+ rendered rows (~2 ms/row) for no observable
// change. The context provider lives inside the memo boundary so margin
// dropdowns still react to name edits via context updates.
function ProductsDataTableImpl({
  rows,
  margins,
  defaultMarginId,
  emptyMessage,
  productHeader,
  costHeader,
  marginHeader,
  saleHeader,
  nameTemplate,
  costTemplate,
  marginTemplate,
  saleTemplate,
  actionsTemplate,
}: Props) {
  // Windowed rendering: only the ~visible rows mount, so rebuilding the row
  // list (add skill, search, filter) re-renders ~20 rows instead of 600+.
  const virtualScrollerOptions = useTableVirtualScroll(rows.length, ROW_REM_HEIGHT)

  return (
    <MarginOptionsContext.Provider value={{ options: margins, defaultMarginId }}>
      <DataTable
        value={rows}
        dataKey="rowKey"
        size="small"
        scrollable
        scrollHeight="flex"
        virtualScrollerOptions={virtualScrollerOptions}
        emptyMessage={emptyMessage}
      >
        <Column header={productHeader} body={nameTemplate} bodyStyle={CELL_STYLE} />
        <Column
          header={costHeader}
          body={costTemplate}
          style={{ width: '5rem' }}
          bodyStyle={CELL_STYLE}
          headerClassName="p-align-right"
        />
        <Column
          header={marginHeader}
          body={marginTemplate}
          style={{ width: '7rem' }}
          bodyStyle={CELL_STYLE}
        />
        <Column
          header={saleHeader}
          body={saleTemplate}
          style={{ width: '5rem' }}
          bodyStyle={CELL_STYLE}
          headerClassName="p-align-right"
        />
        <Column
          body={actionsTemplate}
          style={{ width: '2rem' }}
          bodyStyle={{ ...CELL_STYLE, paddingLeft: '0.25rem', paddingRight: '0.25rem' }}
          headerStyle={{ paddingLeft: '0.25rem', paddingRight: '0.25rem' }}
        />
      </DataTable>
    </MarginOptionsContext.Provider>
  )
}

export const ProductsDataTable = memo(ProductsDataTableImpl)
