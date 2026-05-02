import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Button } from 'primereact/button'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useDependencyGraphContext } from '@/components/price-calculator/recipe-dependency-graph/dependency-graph-context'
import type { DepRecipeNodeData } from '@/components/price-calculator/recipe-dependency-graph/recipe-dependency-layout'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { getRecipeSkillInfo } from '@/hooks/use-products'
import { useStores } from '@/stores/providers'

function DepRecipeNodeImpl({ data }: NodeProps) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { datasetId, onOpenRecipe } = useDependencyGraphContext()
  const { getName } = useLocalizedName(datasetId)

  const d = data as DepRecipeNodeData
  const recipeRow = gameDataStore.getRow('recipes', d.recipeId)
  const recipeIsCustom = !!recipeRow?.isCustom
  const recipeName = getName('recipe', d.recipeId) || ((recipeRow?.name as string) ?? '')
  const skill = getRecipeSkillInfo(gameDataStore, d.recipeId, getName)

  const productRow = d.primaryItemId ? gameDataStore.getRow('items', d.primaryItemId) : null
  const productRawName = productRow ? ((productRow.name as string) ?? '') : ''
  const productIsCustom = !!productRow?.isCustom

  return (
    <div className="dependency-graph-node dependency-graph-node--root">
      <div className="flex align-items-center gap-2">
        <RecipeIcon
          primaryProduct={{ name: productRawName, isCustom: productIsCustom || recipeIsCustom }}
          size={32}
        />
        <span className="font-bold flex-grow-1" style={{ wordBreak: 'break-word' }}>
          {recipeName}
        </span>
        {skill.skillRawName && (
          <SkillIcon skill={{ name: skill.skillRawName }} alt={skill.skillName} />
        )}
        {onOpenRecipe && (
          <Button
            icon="pi pi-external-link"
            text
            size="small"
            className="dependency-graph-icon-button"
            tooltip={t('priceCalculator.dependencyGraph.openRecipe')}
            tooltipOptions={{ position: 'top' }}
            onClick={() => onOpenRecipe(d.recipeId)}
            aria-label={t('priceCalculator.dependencyGraph.openRecipe')}
          />
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={d.hasOutgoing ? undefined : 'dependency-graph-handle--hidden'}
      />
    </div>
  )
}

export const DepRecipeNode = memo(DepRecipeNodeImpl)
