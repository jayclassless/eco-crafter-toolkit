import type { Product, ProductParent } from '@/hooks/use-products'

export interface MarginOption {
  id: string
  name: string
}

export interface ParentRow {
  kind: 'parent'
  rowKey: string
  parent: ProductParent
  /** Child count — kept for potential future use (count badge etc.). */
  childCount: number
}

export interface ChildRow {
  kind: 'child'
  rowKey: string
  product: Product
  parent: ProductParent
}

export interface FlatRow {
  kind: 'flat'
  rowKey: string
  product: Product
}

export type Row = ParentRow | ChildRow | FlatRow
