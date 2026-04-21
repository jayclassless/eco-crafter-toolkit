import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { useTranslation } from 'react-i18next'

import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { TagLabel } from '@/components/common/TagLabel'
import type { UsedInRecipe } from '@/lib/used-in-recipes'

interface Props {
  rows: UsedInRecipe[]
  emptyMessage: string
  onOpenRecipe: (recipeId: string) => void
}

export function UsedInRecipesTable({ rows, emptyMessage, onOpenRecipe }: Props) {
  const { t } = useTranslation()

  const skillTemplate = (row: UsedInRecipe) => {
    if (!row.skillId) return <span className="text-color-secondary">—</span>
    return (
      <div className="flex align-items-center gap-2">
        {row.skillRawName && <SkillIcon skill={{ name: row.skillRawName }} />}
        <span>{row.skillName}</span>
      </div>
    )
  }

  const recipeTemplate = (row: UsedInRecipe) => (
    <div className="flex align-items-center gap-2">
      {row.recipePrimaryProductRawName && (
        <RecipeIcon primaryProduct={{ name: row.recipePrimaryProductRawName }} />
      )}
      <Button
        label={row.recipeName}
        link
        className="p-0"
        pt={{ label: { style: { textAlign: 'left' } } }}
        onClick={() => onOpenRecipe(row.recipeId)}
      />
      {row.viaTag && (
        <TagLabel
          tagName={row.viaTag.tagName}
          title={t('priceCalculator.usedInRecipes.viaTag', { tag: row.viaTag.tagName })}
        />
      )}
    </div>
  )

  const quantityTemplate = (row: UsedInRecipe) => (
    <span className="text-right block">{row.quantity}</span>
  )

  return (
    <DataTable value={rows} dataKey="rowKey" size="small" emptyMessage={emptyMessage}>
      <Column
        header={t('priceCalculator.usedInRecipes.skill')}
        body={skillTemplate}
        style={{ width: '15rem' }}
      />
      <Column header={t('priceCalculator.usedInRecipes.recipe')} body={recipeTemplate} />
      <Column
        header={t('priceCalculator.usedInRecipes.quantity')}
        body={quantityTemplate}
        style={{ width: '5rem' }}
        headerClassName="p-align-right"
      />
    </DataTable>
  )
}
