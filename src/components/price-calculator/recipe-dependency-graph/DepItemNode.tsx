import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Button } from 'primereact/button'
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ItemIcon } from '@/components/common/ItemIcon'
import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useDependencyGraphContext } from '@/components/price-calculator/recipe-dependency-graph/dependency-graph-context'
import type { DepItemNodeData } from '@/components/price-calculator/recipe-dependency-graph/recipe-dependency-layout'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { getRecipeSkillInfo } from '@/hooks/use-products'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { useStores } from '@/stores/providers'

interface ItemOption {
  id: string
  name: string
  rawName: string
  isCustom: boolean
}

interface RecipeOption {
  id: string
  name: string
  primaryRawName: string
  primaryIsCustom: boolean
  recipeIsCustom: boolean
}

function DepItemNodeImpl({ id: nodeId, data }: NodeProps) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { datasetId, onOpenMaterial, onOpenRecipe, onSelectRecipe, onSelectTagItem } =
    useDependencyGraphContext()
  const { getName } = useLocalizedName(datasetId)

  const d = data as DepItemNodeData
  const indexes = getGameDataIndexes(gameDataStore)

  const itemRow = gameDataStore.getRow('items', d.itemId)
  const itemRawName = (itemRow?.name as string) ?? ''
  const itemIsCustom = !!itemRow?.isCustom
  const itemName = getName('item', d.itemId) || itemRawName

  const resolvedItemId = d.isTag ? (d.selectedTagItemId ?? d.itemId) : d.itemId

  // When the node represents a recipe (has a selected primary recipe),
  // surface that recipe's skill icon — replaces the per-edge quantity that
  // used to live here. Leaf nodes (raw materials with no recipe) render
  // nothing in this slot.
  const selectedRecipeSkill = getRecipeSkillInfo(gameDataStore, d.selectedRecipeId ?? '', getName)

  const tagOptions = useMemo<ItemOption[]>(() => {
    if (!d.isTag || !d.tagItemIds) return []
    return d.tagItemIds.map((memberId) => {
      const row = gameDataStore.getRow('items', memberId)
      return {
        id: memberId,
        name: getName('item', memberId) || ((row?.name as string) ?? memberId),
        rawName: (row?.name as string) ?? '',
        isCustom: !!row?.isCustom,
      }
    })
  }, [d.isTag, d.tagItemIds, gameDataStore, getName])

  const recipeOptions = useMemo<RecipeOption[]>(() => {
    if (d.availableRecipeIds.length < 2) return []
    return d.availableRecipeIds.map((rid) => {
      const recipeRow = gameDataStore.getRow('recipes', rid)
      const productIds = indexes.productItemIdsByRecipeId.get(rid) ?? []
      const ingSet = indexes.ingredientItemIdsByRecipeId.get(rid)
      const primaryId = productIds.find((pid) => !ingSet?.has(pid)) ?? productIds[0] ?? ''
      const primaryRow = primaryId ? gameDataStore.getRow('items', primaryId) : null
      return {
        id: rid,
        name: getName('recipe', rid) || ((recipeRow?.name as string) ?? rid),
        primaryRawName: (primaryRow?.name as string) ?? '',
        primaryIsCustom: !!primaryRow?.isCustom,
        recipeIsCustom: !!recipeRow?.isCustom,
      }
    })
  }, [d.availableRecipeIds, gameDataStore, getName, indexes])

  const tagItemTemplate = (opt: ItemOption | null) => {
    if (!opt) return null
    return (
      <div className="flex align-items-center gap-2">
        <ItemIcon item={{ name: opt.rawName, isCustom: opt.isCustom }} size={20} />
        <span>{opt.name}</span>
      </div>
    )
  }

  const recipeItemTemplate = (opt: RecipeOption | null) => {
    if (!opt) return null
    return (
      <div className="flex align-items-center gap-2">
        <RecipeIcon
          primaryProduct={{
            name: opt.primaryRawName,
            isCustom: opt.primaryIsCustom || opt.recipeIsCustom,
          }}
          size={20}
        />
        <span>{opt.name}</span>
      </div>
    )
  }

  const onTagChange = (e: DropdownChangeEvent) => {
    if (typeof e.value === 'string') onSelectTagItem(nodeId, e.value)
  }
  const onRecipeChange = (e: DropdownChangeEvent) => {
    if (typeof e.value === 'string') onSelectRecipe(nodeId, e.value)
  }

  return (
    <div className="dependency-graph-node">
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={d.hasIncoming ? undefined : 'dependency-graph-handle--hidden'}
      />
      <div className="flex align-items-center gap-2 mb-1">
        <ItemIcon item={{ name: itemRawName, isCustom: itemIsCustom }} size={28} />
        {d.isTag && <i className="pi pi-tag text-sm text-color-secondary" />}
        <span className="font-medium flex-grow-1" style={{ wordBreak: 'break-word' }}>
          {itemName}
        </span>
        {selectedRecipeSkill.skillRawName && (
          <SkillIcon
            skill={{ name: selectedRecipeSkill.skillRawName }}
            alt={selectedRecipeSkill.skillName}
          />
        )}
        {onOpenMaterial && (
          <Button
            icon="pi pi-external-link"
            text
            size="small"
            className="dependency-graph-icon-button"
            tooltip={t('priceCalculator.dependencyGraph.openItem')}
            tooltipOptions={{ position: 'top' }}
            onClick={() => onOpenMaterial(resolvedItemId)}
            aria-label={t('priceCalculator.dependencyGraph.openItem')}
          />
        )}
      </div>

      {tagOptions.length > 0 && (
        <Dropdown
          value={d.selectedTagItemId}
          options={tagOptions}
          optionLabel="name"
          optionValue="id"
          itemTemplate={tagItemTemplate}
          valueTemplate={tagItemTemplate}
          onChange={onTagChange}
          className="w-full p-inputtext-sm mt-1"
          placeholder={t('priceCalculator.dependencyGraph.selectTagItem')}
        />
      )}

      {recipeOptions.length > 0 && (
        <div className="flex align-items-center gap-1 mt-1">
          <Dropdown
            value={d.selectedRecipeId}
            options={recipeOptions}
            optionLabel="name"
            optionValue="id"
            itemTemplate={recipeItemTemplate}
            valueTemplate={recipeItemTemplate}
            onChange={onRecipeChange}
            className="flex-grow-1 p-inputtext-sm"
            placeholder={t('priceCalculator.dependencyGraph.selectRecipe')}
          />
          {onOpenRecipe && d.selectedRecipeId && (
            <Button
              icon="pi pi-external-link"
              text
              size="small"
              className="dependency-graph-icon-button"
              tooltip={t('priceCalculator.dependencyGraph.openRecipe')}
              tooltipOptions={{ position: 'top' }}
              onClick={() => d.selectedRecipeId && onOpenRecipe(d.selectedRecipeId)}
              aria-label={t('priceCalculator.dependencyGraph.openRecipe')}
            />
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={d.hasOutgoing ? undefined : 'dependency-graph-handle--hidden'}
      />
    </div>
  )
}

export const DepItemNode = memo(DepItemNodeImpl)
