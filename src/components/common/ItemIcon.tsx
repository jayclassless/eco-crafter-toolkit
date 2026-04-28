import { EcoIcon } from './EcoIcon'

interface Props {
  item: { name: string; isCustom?: boolean }
  size?: number
  className?: string
  alt?: string
}

/**
 * Renders an item's game icon, or a `pi pi-book` placeholder for items the
 * user authored (which have no asset in the dataset).
 */
export function ItemIcon({ item, size = 24, className, alt }: Props) {
  if (item.isCustom) {
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
        aria-label={alt ?? item.name}
      />
    )
  }
  return <EcoIcon name={item.name} size={size} className={className} alt={alt ?? item.name} />
}
