import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { SelectButton } from 'primereact/selectbutton'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { TagLabel } from '@/components/common/TagLabel'
import { useLocalization } from '@/hooks/use-localization'
import type { UsedInRecipe } from '@/lib/used-in-recipes'

/** `mine` = recipes selected in the current build, `other` = every other
 * recipe in the dataset that consumes the item, `all` = both. */
export type UsedInScope = 'mine' | 'other' | 'all'

interface Props {
  /** Every consuming recipe in the dataset; the scope toggle filters them. */
  rows: UsedInRecipe[]
  /** Empty-state text per scope — the wording differs by caller (item vs.
   * recipe product) and by scope. */
  emptyMessages: Record<UsedInScope, string>
  onOpenRecipe: (recipeId: string) => void
}

export function UsedInRecipesTable({ rows, emptyMessages, onOpenRecipe }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()
  const [scope, setScope] = useState<UsedInScope>('mine')

  const scopeOptions = [
    { label: t('priceCalculator.usedInRecipes.scopeMine'), value: 'mine' },
    { label: t('priceCalculator.usedInRecipes.scopeOther'), value: 'other' },
    { label: t('priceCalculator.usedInRecipes.scopeAll'), value: 'all' },
  ]

  const visibleRows = useMemo(() => {
    if (scope === 'all') return rows
    const wantInBuild = scope === 'mine'
    return rows.filter((row) => row.inBuild === wantInBuild)
  }, [rows, scope])

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
      {(row.recipePrimaryProductRawName || row.recipeIsCustom) && (
        <RecipeIcon
          primaryProduct={{
            name: row.recipePrimaryProductRawName,
            isCustom: row.recipeIsCustom,
          }}
        />
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
    <span className="text-right block">
      {formatNumber(row.quantity, { maximumFractionDigits: 2 })}
    </span>
  )

  return (
    <div className="flex flex-column gap-2">
      <div className="flex justify-content-end">
        <SelectButton
          value={scope}
          options={scopeOptions}
          onChange={(e) => {
            if (e.value) setScope(e.value as UsedInScope)
          }}
          allowEmpty={false}
          aria-label={t('priceCalculator.usedInRecipes.scopeLabel')}
          pt={{ button: { className: 'p-button-sm py-1' } }}
        />
      </div>
      <DataTable
        value={visibleRows}
        dataKey="rowKey"
        size="small"
        emptyMessage={emptyMessages[scope]}
        scrollable
        scrollHeight="50vh"
      >
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
    </div>
  )
}
