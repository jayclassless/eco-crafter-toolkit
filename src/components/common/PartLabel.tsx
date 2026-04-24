import { useTranslation } from 'react-i18next'

interface Props {
  title?: string
}

export function PartLabel({ title }: Props) {
  const { t } = useTranslation()
  return (
    <span className="text-color-secondary text-sm flex align-items-center gap-1" title={title}>
      <i className="pi pi-cog text-xs" />
      {t('priceCalculator.products.recipeFilter.part')}
    </span>
  )
}
