import { EcoIcon } from './EcoIcon'

interface Props {
  primaryProduct: { name: string; isCustom?: boolean }
  size?: number
  className?: string
  alt?: string
}

/**
 * Renders a recipe's primary-product icon. When the recipe (or its primary
 * product) is custom, falls back to a `pi pi-book` placeholder since custom
 * entities have no asset in the dataset.
 */
export function RecipeIcon({ primaryProduct, size = 24, className, alt }: Props) {
  if (primaryProduct.isCustom) {
    return (
      <i
        className={`pi pi-book ${className ?? ''}`}
        style={{
          fontSize: `calc(0.95 * ${size}px)`,
          textAlign: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          lineHeight: `${size}px`,
        }}
        aria-label={alt ?? primaryProduct.name}
      />
    )
  }
  return (
    <EcoIcon
      name={primaryProduct.name}
      size={size}
      className={className}
      alt={alt ?? primaryProduct.name}
    />
  )
}
