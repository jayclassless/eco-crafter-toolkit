export interface Material {
  // Unique row key. For children, namespaced by parent tag so the same item
  // appearing under multiple tags gets distinct DataTable keys.
  rowKey: string
  itemOrTagId: string
  name: string
  rawName: string
  isTag: boolean
  userPriceId: string
  isOverride: boolean
  isChild: boolean
  parentTagId: string
  parentUserPriceId: string
  // True when this item is produced by one of the build's recipes (primary
  // or secondary product). Such items get their price from the solver, so
  // the materials list shows the computed cost instead of an editable
  // price field.
  isProduced: boolean
}

export interface MaterialGroup {
  parent: Material
  children: Material[]
}
