// A crop the user can plant, derived from a harvested item that carries growth
// data (`maturityAgeDays > 0`). `rawName` is the item's class name, used to
// resolve its game icon; `name` is the in-world species name (e.g. "Oak", not
// the harvested "Oak Log"). `isTree` groups trees apart from food crops.
// The growth fields are kept flat (rather than a nested range object) so a
// `Crop` satisfies `CropGrowth` structurally and can be passed straight to the
// crop-growth helpers.
export interface Crop {
  id: string
  name: string
  rawName: string
  isTree: boolean
  maturityAgeDays: number
  postHarvestingGrowth: number
  pickableAtPercent: number
  primaryResourceMin: number
  primaryResourceMax: number
}
