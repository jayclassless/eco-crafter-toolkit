import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useOverlayScrollDismiss } from '@/hooks/use-overlay-scroll-dismiss'

interface Action {
  key: string
  label: string
  icon: string
  onClick: () => void
}

interface Props {
  onMoveToMaterials?: () => void
  onDeleteRecipe?: () => void
}

// Vertical-ellipsis trigger that opens an OverlayPanel with the row's
// available actions. OverlayPanel (vs PrimeReact Menu) gives us the
// expected popover ergonomics: closes on outside click, and via
// `useOverlayScrollDismiss` it also closes on scroll so it doesn't end up
// orphaned from its row.
//
// Hidden actions (undefined callbacks) drop their entries — parent rows
// offer only "Treat as a Material", child rows only "Delete recipe".
export const RowActionsMenu = memo(function RowActionsMenu({
  onMoveToMaterials,
  onDeleteRecipe,
}: Props) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const dismiss = useOverlayScrollDismiss(op)

  const actions: Action[] = []
  if (onMoveToMaterials) {
    actions.push({
      key: 'moveToMaterials',
      label: t('priceCalculator.products.moveToMaterials'),
      icon: 'pi pi-list',
      onClick: onMoveToMaterials,
    })
  }
  if (onDeleteRecipe) {
    actions.push({
      key: 'deleteRecipe',
      label: t('priceCalculator.products.deleteRecipe'),
      icon: 'pi pi-trash',
      onClick: onDeleteRecipe,
    })
  }

  if (actions.length === 0) return null

  return (
    <>
      <Button
        icon="pi pi-ellipsis-v"
        text
        size="small"
        aria-label={t('priceCalculator.products.rowActions')}
        onClick={(e) => op.current?.toggle(e)}
        style={{ width: '1rem', minWidth: '1rem', padding: 0 }}
      />
      <OverlayPanel
        ref={op}
        onShow={dismiss.onShow}
        onHide={dismiss.onHide}
        pt={{ content: { className: 'p-1' } }}
      >
        <div className="flex flex-column">
          {actions.map((a) => (
            <Button
              key={a.key}
              label={a.label}
              icon={a.icon}
              text
              size="small"
              className="w-full"
              pt={{ label: { className: 'text-left flex-1' } }}
              onClick={() => {
                a.onClick()
                op.current?.hide()
              }}
            />
          ))}
        </div>
      </OverlayPanel>
    </>
  )
})
