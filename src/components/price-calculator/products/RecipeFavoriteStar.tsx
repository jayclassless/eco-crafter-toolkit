import { Button } from 'primereact/button'
import { memo, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  buildStore: Store
  userRecipeId: string
  onToggle: (userRecipeId: string, favorite: boolean) => void
}

// Subscribes to its own userRecipes.favorite cell so toggling one star only
// re-renders this single component, not the parent DataTable.
export const RecipeFavoriteStar = memo(function RecipeFavoriteStar({
  buildStore,
  userRecipeId,
  onToggle,
}: Props) {
  const { t } = useTranslation()
  const favorite =
    useCellValue<boolean>(buildStore, 'userRecipes', userRecipeId, 'favorite') ?? false

  const handleClick = (e: ReactMouseEvent) => {
    e.stopPropagation()
    onToggle(userRecipeId, !favorite)
  }

  const label = favorite
    ? t('priceCalculator.products.favorite.toggleOff')
    : t('priceCalculator.products.favorite.toggleOn')

  return (
    <Button
      icon={favorite ? 'pi pi-star-fill' : 'pi pi-star'}
      text
      size="small"
      aria-label={label}
      // Native title, not PrimeReact `tooltip`: rows mount mid-scroll in the
      // virtualized table, where the Tooltip's bind-on-update lifecycle never
      // attaches — see ComputedPriceCell for the same trade-off.
      title={label}
      onClick={handleClick}
      className={favorite ? undefined : 'text-color-secondary'}
      style={{
        width: '1.5rem',
        minWidth: '1.5rem',
        padding: 0,
        color: favorite ? 'var(--yellow-500)' : undefined,
        opacity: favorite ? undefined : 0.4,
      }}
    />
  )
})
