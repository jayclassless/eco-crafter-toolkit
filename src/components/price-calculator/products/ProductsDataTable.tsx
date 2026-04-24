import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { memo, type ReactNode } from 'react'

import type { MarginOption } from '@/hooks/use-products'

import { MarginOptionsContext } from './MarginCell'
import type { Row } from './types'

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
  return (
    <MarginOptionsContext.Provider value={{ options: margins, defaultMarginId }}>
      <DataTable
        value={rows}
        dataKey="rowKey"
        size="small"
        scrollable
        scrollHeight="flex"
        emptyMessage={emptyMessage}
      >
        <Column header={productHeader} body={nameTemplate} />
        <Column
          header={costHeader}
          body={costTemplate}
          style={{ width: '5rem' }}
          headerClassName="p-align-right"
        />
        <Column header={marginHeader} body={marginTemplate} style={{ width: '7rem' }} />
        <Column
          header={saleHeader}
          body={saleTemplate}
          style={{ width: '5rem' }}
          headerClassName="p-align-right"
        />
        <Column
          body={actionsTemplate}
          style={{ width: '2rem' }}
          bodyStyle={{ paddingLeft: '0.25rem', paddingRight: '0.25rem' }}
          headerStyle={{ paddingLeft: '0.25rem', paddingRight: '0.25rem' }}
        />
      </DataTable>
    </MarginOptionsContext.Provider>
  )
}

export const ProductsDataTable = memo(ProductsDataTableImpl)
