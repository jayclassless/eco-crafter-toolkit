import { EcoIcon } from './EcoIcon'

interface Props {
  primaryProduct: { name: string }
  size?: number
  className?: string
  alt?: string
}

export function RecipeIcon({ primaryProduct, size = 24, className, alt }: Props) {
  return (
    <EcoIcon
      name={primaryProduct.name}
      size={size}
      className={className}
      alt={alt ?? primaryProduct.name}
    />
  )
}
