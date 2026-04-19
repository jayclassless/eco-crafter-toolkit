import { EcoIcon } from './EcoIcon'

interface Props {
  table: { name: string }
  size?: number
  className?: string
  alt?: string
}

export function CraftingTableIcon({ table, size = 20, className, alt }: Props) {
  return <EcoIcon name={table.name} size={size} className={className} alt={alt ?? table.name} />
}
