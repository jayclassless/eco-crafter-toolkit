import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Dialog } from 'primereact/dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RecipeIcon } from '@/components/common/RecipeIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import type { PriceSignal } from '@/hooks/use-prices-signal'
import { buildRecipeProductItemIds, getRecipePrimaryProductRawName } from '@/hooks/use-products'
import { useStores } from '@/stores/providers'

import {
  type AdHocTalentStates,
  computeAdHocRecipe,
  seedIngredientPrices,
} from './adhoc-recipe-calc'
import { AdHocCostBreakdown } from './AdHocCostBreakdown'
import { AdHocRecipeInputs } from './AdHocRecipeInputs'

interface RecipeOption {
  id: string
  name: string
  rawName: string
  isCustom: boolean
}

interface Props {
  visible: boolean
  onHide: () => void
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
}

export function AdHocRecipeCalculatorDialog({
  visible,
  onHide,
  buildId,
  datasetId,
  priceSignal,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)

  const [selectedOption, setSelectedOption] = useState<RecipeOption | undefined>(undefined)
  const [selectedRecipeId, setSelectedRecipeId] = useState('')
  const [suggestions, setSuggestions] = useState<RecipeOption[]>([])
  const [skillLevel, setSkillLevel] = useState(0)
  const [pluginModuleId, setPluginModuleId] = useState('')
  const [talentStates, setTalentStates] = useState<AdHocTalentStates>({})
  const [ingredientPrices, setIngredientPrices] = useState<Record<string, number>>({})

  // Reset to a clean slate each time the dialog is opened.
  useEffect(() => {
    if (!visible) return
    setSelectedOption(undefined)
    setSelectedRecipeId('')
    setSuggestions([])
    setSkillLevel(0)
    setPluginModuleId('')
    setTalentStates({})
    setIngredientPrices({})
  }, [visible])

  const recipeOptions = useMemo<RecipeOption[]>(() => {
    const productIdsByRecipe = buildRecipeProductItemIds(gameDataStore)
    const out: RecipeOption[] = []
    for (const rowId of gameDataStore.getRowIds('recipes')) {
      const recipe = gameDataStore.getRow('recipes', rowId)
      if (recipe.datasetId !== datasetId) continue
      out.push({
        id: rowId,
        name: getName('recipe', rowId) || (recipe.name as string),
        rawName: getRecipePrimaryProductRawName(gameDataStore, rowId, productIdsByRecipe),
        isCustom: !!recipe.isCustom,
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [gameDataStore, datasetId, getName])

  const { calorieCost, defaultShareForSecondaryItems } = useMemo(() => {
    let calorieCost = 0
    let defaultShareForSecondaryItems = 20
    for (const rowId of buildStore.getRowIds('userSettings')) {
      const row = buildStore.getRow('userSettings', rowId)
      if (row.buildId !== buildId) continue
      calorieCost = (row.calorieCost as number) ?? 0
      defaultShareForSecondaryItems = (row.defaultShareForSecondaryItems as number) ?? 20
      break
    }
    return { calorieCost, defaultShareForSecondaryItems }
  }, [buildStore, buildId])

  const searchRecipes = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase()
    setSuggestions(
      query
        ? recipeOptions.filter((r) => r.name.toLowerCase().includes(query))
        : recipeOptions.slice()
    )
  }

  const handleSelect = (option: RecipeOption) => {
    setSelectedOption(option)
    setSelectedRecipeId(option.id)
    setSkillLevel(0)
    setPluginModuleId('')
    setTalentStates({})
    setIngredientPrices(
      seedIngredientPrices(gameDataStore, buildStore, priceSignal, buildId, option.id)
    )
  }

  const onPriceChange = useCallback((itemOrTagId: string, value: number | null) => {
    setIngredientPrices((prev) => ({ ...prev, [itemOrTagId]: value ?? 0 }))
  }, [])

  const onTalentChange = useCallback(
    (talentId: string, state: { enabled: boolean; level: number }) => {
      setTalentStates((prev) => ({ ...prev, [talentId]: state }))
    },
    []
  )

  const recipeRow = selectedRecipeId ? gameDataStore.getRow('recipes', selectedRecipeId) : null
  const skillId = (recipeRow?.skillId as string) ?? ''
  const craftingTableId = (recipeRow?.craftingTableId as string) ?? ''

  const result = useMemo(() => {
    if (!selectedRecipeId) return null
    return computeAdHocRecipe(
      gameDataStore,
      datasetId,
      getName,
      selectedRecipeId,
      { skillLevel, pluginModuleId, talentStates, ingredientPrices },
      calorieCost,
      defaultShareForSecondaryItems
    )
  }, [
    gameDataStore,
    datasetId,
    getName,
    selectedRecipeId,
    skillLevel,
    pluginModuleId,
    talentStates,
    ingredientPrices,
    calorieCost,
    defaultShareForSecondaryItems,
  ])

  const recipeItemTemplate = (item: RecipeOption) => (
    <div className="flex align-items-center gap-2">
      {(item.rawName || item.isCustom) && (
        <RecipeIcon primaryProduct={{ name: item.rawName, isCustom: item.isCustom }} />
      )}
      <span>{item.name}</span>
    </div>
  )

  return (
    <Dialog
      header={t('settings.adHocRecipeCalculator.title')}
      visible={visible}
      onHide={onHide}
      style={{ width: '60%' }}
      modal
      dismissableMask
      maximizable
    >
      <div className="flex flex-column gap-4">
        <AutoComplete
          value={selectedOption}
          suggestions={suggestions}
          completeMethod={searchRecipes}
          field="name"
          dropdown
          forceSelection
          itemTemplate={recipeItemTemplate}
          placeholder={t('settings.adHocRecipeCalculator.placeholder')}
          onChange={(e) => {
            const v = e.value as RecipeOption | undefined
            if (v && typeof v === 'object') handleSelect(v)
            else setSelectedOption(undefined)
          }}
          className="w-full"
          inputClassName="w-full"
        />

        {selectedRecipeId && (
          <AdHocRecipeInputs
            gameDataStore={gameDataStore}
            skillId={skillId}
            craftingTableId={craftingTableId}
            getName={getName}
            skillLevel={skillLevel}
            onSkillLevel={setSkillLevel}
            pluginModuleId={pluginModuleId}
            onPluginModule={setPluginModuleId}
            talentStates={talentStates}
            onTalentChange={onTalentChange}
          />
        )}

        {result && (
          <AdHocCostBreakdown
            gameDataStore={gameDataStore}
            recipeId={selectedRecipeId}
            result={result}
            ingredientPrices={ingredientPrices}
            onPriceChange={onPriceChange}
            getName={getName}
          />
        )}
      </div>
    </Dialog>
  )
}
