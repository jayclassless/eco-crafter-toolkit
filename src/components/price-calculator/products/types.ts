import type { Product, ProductParent } from '@/hooks/use-products'

export interface MarginOption {
  id: string
  name: string
}

interface ParentRow {
  kind: 'parent'
  rowKey: string
  parent: ProductParent
  /** Child count — kept for potential future use (count badge etc.). */
  childCount: number
  /** userRecipeIds of the visible children — drives the parent favorite toggle. */
  childUserRecipeIds: readonly string[]
}

interface ChildRow {
  kind: 'child'
  rowKey: string
  product: Product
  parent: ProductParent
}

interface FlatRow {
  kind: 'flat'
  rowKey: string
  product: Product
}

export type Row = ParentRow | ChildRow | FlatRow
