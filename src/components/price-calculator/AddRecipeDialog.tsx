import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { SelectButton, type SelectButtonChangeEvent } from 'primereact/selectbutton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EcoIcon } from '@/components/common/EcoIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { buildRecipeProductItemIds, getRecipePrimaryProductRawName } from '@/hooks/use-products'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

interface RecipeOption {
  id: string
  name: string
  rawName: string
}

interface ModeOption {
  label: string
  value: 'skill' | 'any'
  disabled?: boolean
}

interface Props {
  visible: boolean
  onHide: () => void
  buildId: string
  datasetId: string
  existingRecipeIds: Set<string>
}

const BUILD_TABLES = ['userSkills'] as const
const GAME_DATA_TABLES = ['recipes'] as const

export function AddRecipeDialog({ visible, onHide, buildId, datasetId, existingRecipeIds }: Props) {
  const { t } = useTranslation()
  const { buildStore, gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const recipeMgmt = useRecipeManagement(buildId)

  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)
  const gameDataRev = useStoreRevision(gameDataStore, GAME_DATA_TABLES)

  const { skillRecipes, anyRecipes } = useMemo(() => {
    const buildSkillIds = new Set<string>()
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId === buildId) {
        buildSkillIds.add(row.skillId as string)
      }
    }

    // Shared icon-resolution helper: builds the recipe→products index once
    // and resolves each recipe's primary product rawName the same way
    // buildProducts does, so the icon shown in the dialog matches the one
    // in the Products table.
    const productItemIdsByRecipeId = buildRecipeProductItemIds(gameDataStore)

    const skill: RecipeOption[] = []
    const any: RecipeOption[] = []
    for (const rowId of gameDataStore.getRowIds('recipes')) {
      const recipe = gameDataStore.getRow('recipes', rowId)
      if (recipe.datasetId !== datasetId) continue
      if (existingRecipeIds.has(rowId)) continue
      const name = getName('recipe', rowId)
      const rawName = getRecipePrimaryProductRawName(gameDataStore, rowId, productItemIdsByRecipeId)
      const option: RecipeOption = { id: rowId, name, rawName }
      any.push(option)
      if (buildSkillIds.has(recipe.skillId as string)) {
        skill.push(option)
      }
    }

    const byName = (a: RecipeOption, b: RecipeOption) => a.name.localeCompare(b.name)
    skill.sort(byName)
    any.sort(byName)
    return { skillRecipes: skill, anyRecipes: any }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildStore,
    gameDataStore,
    buildId,
    datasetId,
    existingRecipeIds,
    getName,
    buildRev,
    gameDataRev,
  ])

  const [mode, setMode] = useState<'skill' | 'any'>('skill')
  const [selected, setSelected] = useState<RecipeOption | undefined>(undefined)
  const [suggestions, setSuggestions] = useState<RecipeOption[]>([])

  // Reset state and pick default mode whenever the dialog opens.
  // Intentionally only depends on `visible` — the user's toggle choice should
  // stick while the dialog is open, even if the underlying lists change.
  useEffect(() => {
    if (!visible) return
    setMode(skillRecipes.length === 0 ? 'any' : 'skill')
    setSelected(undefined)
    setSuggestions([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const modeOptions = useMemo<ModeOption[]>(
    () => [
      {
        label: t('priceCalculator.addRecipeDialog.mode.skill'),
        value: 'skill',
        disabled: skillRecipes.length === 0,
      },
      {
        label: t('priceCalculator.addRecipeDialog.mode.any'),
        value: 'any',
      },
    ],
    [t, skillRecipes.length]
  )

  const searchRecipes = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase()
    const active = mode === 'skill' ? skillRecipes : anyRecipes
    const filtered = query
      ? active.filter((r) => r.name.toLowerCase().includes(query))
      : active.slice()
    setSuggestions(filtered)
  }

  const handleModeChange = (e: SelectButtonChangeEvent) => {
    if (!e.value) return
    setMode(e.value as 'skill' | 'any')
    setSelected(undefined)
    setSuggestions([])
  }

  const handleAdd = () => {
    if (!selected) return
    recipeMgmt.addRecipe(selected.id)
    onHide()
  }

  const itemTemplate = useCallback(
    (item: RecipeOption) => (
      <div className="flex align-items-center gap-2">
        {item.rawName && <EcoIcon name={item.rawName} size={20} />}
        <span>{item.name}</span>
      </div>
    ),
    []
  )

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button label={t('priceCalculator.addRecipeDialog.cancel')} outlined onClick={onHide} />
      <Button
        label={t('priceCalculator.addRecipeDialog.add')}
        disabled={!selected}
        onClick={handleAdd}
      />
    </div>
  )

  return (
    <Dialog
      header={t('priceCalculator.addRecipeDialog.title')}
      visible={visible}
      onHide={onHide}
      style={{ width: '32rem' }}
      modal
      footer={footer}
    >
      <div className="flex flex-column gap-3">
        <SelectButton
          value={mode}
          options={modeOptions}
          onChange={handleModeChange}
          optionLabel="label"
          optionValue="value"
          optionDisabled="disabled"
          allowEmpty={false}
        />
        <AutoComplete
          value={selected}
          suggestions={suggestions}
          completeMethod={searchRecipes}
          field="name"
          dropdown
          forceSelection
          itemTemplate={itemTemplate}
          placeholder={t('priceCalculator.addRecipeDialog.placeholder')}
          onChange={(e) => setSelected((e.value as RecipeOption | undefined) ?? undefined)}
          className="w-full"
          inputClassName="w-full"
        />
        {skillRecipes.length === 0 && mode === 'any' && (
          <small className="text-color-secondary">
            {t('priceCalculator.addRecipeDialog.noSkillRecipesHint')}
          </small>
        )}
      </div>
    </Dialog>
  )
}
