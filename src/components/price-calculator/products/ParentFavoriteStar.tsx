import { Button } from 'primereact/button'
import { memo, useMemo, type MouseEvent as ReactMouseEvent, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

type AggregateState = 'none' | 'some' | 'all'

interface Props {
  buildStore: Store
  childUserRecipeIds: readonly string[]
  onToggleAll: (userRecipeIds: readonly string[], favorite: boolean) => void
}

function computeAggregate(store: Store, ids: readonly string[]): AggregateState {
  if (ids.length === 0) return 'none'
  let favoriteCount = 0
  for (const id of ids) {
    if (store.getCell('userRecipes', id, 'favorite') === true) favoriteCount++
  }
  if (favoriteCount === 0) return 'none'
  if (favoriteCount === ids.length) return 'all'
  return 'some'
}

// Tri-state aggregate of children's favorite cells. Subscribes to each child's
// favorite cell directly and only re-renders when the aggregate state flips,
// so per-child toggles don't churn this component.
export const ParentFavoriteStar = memo(function ParentFavoriteStar({
  buildStore,
  childUserRecipeIds,
  onToggleAll,
}: Props) {
  const { t } = useTranslation()

  // The aggregate is a scalar, so `useSyncExternalStore` bails out of the
  // re-render whenever a per-child toggle leaves the tri-state unchanged.
  const { subscribe, getSnapshot } = useMemo(
    () => ({
      subscribe: (onChange: () => void) => {
        const listenerIds = childUserRecipeIds.map((id) =>
          buildStore.addCellListener('userRecipes', id, 'favorite', onChange)
        )
        return () => {
          for (const lid of listenerIds) buildStore.delListener(lid)
        }
      },
      getSnapshot: () => computeAggregate(buildStore, childUserRecipeIds),
    }),
    [buildStore, childUserRecipeIds]
  )
  const aggregate = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const handleClick = (e: ReactMouseEvent) => {
    e.stopPropagation()
    onToggleAll(childUserRecipeIds, aggregate !== 'all')
  }

  const label =
    aggregate === 'all'
      ? t('priceCalculator.products.favorite.toggleAllOff')
      : t('priceCalculator.products.favorite.toggleAllOn')

  const filled = aggregate !== 'none'
  const opacity = aggregate === 'all' ? undefined : aggregate === 'some' ? 0.5 : 0.4

  return (
    <Button
      icon={filled ? 'pi pi-star-fill' : 'pi pi-star'}
      text
      size="small"
      aria-label={label}
      // Native title — see RecipeFavoriteStar for why not PrimeReact tooltip.
      title={label}
      onClick={handleClick}
      className={filled ? undefined : 'text-color-secondary'}
      style={{
        width: '1.5rem',
        minWidth: '1.5rem',
        padding: 0,
        color: filled ? 'var(--yellow-500)' : undefined,
        opacity,
      }}
    />
  )
})
