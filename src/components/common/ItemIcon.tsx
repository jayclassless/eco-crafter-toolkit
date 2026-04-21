import { EcoIcon } from './EcoIcon'

interface Props {
  item: { name: string }
  size?: number
  className?: string
  alt?: string
}

export function ItemIcon({ item, size = 24, className, alt }: Props) {
  return <EcoIcon name={item.name} size={size} className={className} alt={alt ?? item.name} />
}
