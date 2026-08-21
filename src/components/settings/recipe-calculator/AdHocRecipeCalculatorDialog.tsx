import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Dialog } from 'primereact/dialog'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type RecipeOption, resolveRecipeSkillName } from '@/components/common/recipe-option'
import { RecipeOptionItem } from '@/components/common/RecipeOptionItem'
import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import type { PriceSignal } from '@/hooks/use-prices-signal'
import { buildRecipeProductItemIds, getRecipePrimaryProductRawName } from '@/hooks/use-products'
import { useResetOnChange } from '@/hooks/use-reset-on-change'
import type { SlotSelection } from '@/lib/module-slots'
import { useStores } from '@/stores/providers'
import type { ModuleSlot } from '@/types/game-data'

import {
  type AdHocTalentStates,
  computeAdHocRecipe,
  seedIngredientPrices,
} from './adhoc-recipe-calc'
import { AdHocCostBreakdown } from './AdHocCostBreakdown'
import { AdHocRecipeInputs } from './AdHocRecipeInputs'

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
  const { compare } = useLocalization()

  // Holds either the picked recipe (object) or the in-progress typed string, so
  // the AutoComplete keeps the user's text visible until a choice is made. Only
  // an actual selection updates `selectedRecipeId` (via handleSelect).
  const [selectedOption, setSelectedOption] = useState<RecipeOption | string | undefined>(undefined)
  const [selectedRecipeId, setSelectedRecipeId] = useState('')
  const [suggestions, setSuggestions] = useState<RecipeOption[]>([])
  const [skillLevel, setSkillLevel] = useState(0)
  // Installed module per slot. A legacy dataset only ever exposes Specialty, so
  // this holds at most one entry there.
  const [moduleIdsBySlot, setModuleIdsBySlot] = useState<SlotSelection>({})
  const [talentStates, setTalentStates] = useState<AdHocTalentStates>({})
  const [ingredientPrices, setIngredientPrices] = useState<Record<string, number>>({})

  // Reset to a clean slate each time the dialog is opened.
  useResetOnChange(visible, () => {
    if (!visible) return
    setSelectedOption(undefined)
    setSelectedRecipeId('')
    setSuggestions([])
    setSkillLevel(0)
    setModuleIdsBySlot({})
    setTalentStates({})
    setIngredientPrices({})
  })

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
        skillName: resolveRecipeSkillName(gameDataStore, getName, recipe.skillId as string),
        isCustom: !!recipe.isCustom,
      })
    }
    out.sort((a, b) => compare(a.name, b.name))
    return out
  }, [gameDataStore, datasetId, getName, compare])

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
    // Re-selecting the recipe that is already loaded must NOT reset the
    // controls below. PrimeReact's AutoComplete re-fires onChange with the
    // current option whenever the input loses focus (its forceSelection blur
    // path), and anything the user clicks next — a module slot, a talent, an
    // ingredient price — steals that focus. Without this guard the click that
    // installs a module immediately wipes the module, the skill level, the
    // talents and every edited price, and the calculator silently snaps back
    // to its defaults.
    if (option.id === selectedRecipeId) return
    setSelectedRecipeId(option.id)
    setSkillLevel(0)
    setModuleIdsBySlot({})
    setTalentStates({})
    setIngredientPrices(
      seedIngredientPrices(gameDataStore, buildStore, priceSignal, buildId, option.id)
    )
  }

  const onPriceChange = useCallback((itemOrTagId: string, value: number | null) => {
    setIngredientPrices((prev) => ({ ...prev, [itemOrTagId]: value ?? 0 }))
  }, [])

  const onModuleChange = useCallback((slot: ModuleSlot, pluginModuleId: string) => {
    setModuleIdsBySlot((prev) => ({ ...prev, [slot]: pluginModuleId }))
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
      compare,
      selectedRecipeId,
      {
        skillLevel,
        moduleIds: Object.values(moduleIdsBySlot).filter(Boolean),
        talentStates,
        ingredientPrices,
      },
      calorieCost,
      defaultShareForSecondaryItems
    )
  }, [
    gameDataStore,
    datasetId,
    getName,
    compare,
    selectedRecipeId,
    skillLevel,
    moduleIdsBySlot,
    talentStates,
    ingredientPrices,
    calorieCost,
    defaultShareForSecondaryItems,
  ])

  const recipeItemTemplate = (item: RecipeOption) => <RecipeOptionItem option={item} />

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
            const v = e.value as RecipeOption | string | undefined
            // An object is a real selection; a string is in-progress typing
            // that must stay visible. forceSelection's blur clears (undefined)
            // when the typed text matched nothing.
            if (v && typeof v === 'object') handleSelect(v)
            else setSelectedOption(v)
          }}
          className="w-full"
          inputClassName="w-full"
        />

        {selectedRecipeId && (
          <AdHocRecipeInputs
            gameDataStore={gameDataStore}
            datasetId={datasetId}
            skillId={skillId}
            craftingTableId={craftingTableId}
            getName={getName}
            skillLevel={skillLevel}
            onSkillLevel={setSkillLevel}
            moduleIdsBySlot={moduleIdsBySlot}
            onModuleChange={onModuleChange}
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
