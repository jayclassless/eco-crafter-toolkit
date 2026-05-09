import type { Product, ProductParent } from '@/hooks/use-products'

export interface MarginOption {
  id: string
  name: string
}

interface FamilyRow {
  kind: 'family'
  rowKey: string
  /** Display string shown as the family header. Raw FamilyName from the
   * dataset (English; family names aren't localized in dataset JSON). */
  familyName: string
  /** userRecipeIds of every visible child across all groups in this family
   * cluster — drives the family-level favorite toggle (same behavior as the
   * product-parent toggle, just scoped to the whole family). */
  childUserRecipeIds: readonly string[]
}

interface ParentRow {
  kind: 'parent'
  rowKey: string
  parent: ProductParent
  /** Child count — kept for potential future use (count badge etc.). */
  childCount: number
  /** userRecipeIds of the visible children — drives the parent favorite toggle. */
  childUserRecipeIds: readonly string[]
  /** True when this row sits inside a family-clustered group; nameTemplate
   * adds an extra indent step so the row reads as a child of the family. */
  inFamily?: boolean
}

interface ChildRow {
  kind: 'child'
  rowKey: string
  product: Product
  parent: ProductParent
  inFamily?: boolean
}

interface FlatRow {
  kind: 'flat'
  rowKey: string
  product: Product
  inFamily?: boolean
}

export type Row = FamilyRow | ParentRow | ChildRow | FlatRow
