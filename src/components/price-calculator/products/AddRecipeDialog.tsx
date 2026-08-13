import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { SelectButton, type SelectButtonChangeEvent } from 'primereact/selectbutton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type RecipeOption, resolveRecipeSkillName } from '@/components/common/recipe-option'
import { RecipeOptionItem } from '@/components/common/RecipeOptionItem'
import { CustomEntitiesDialog } from '@/components/settings/datasets/CustomEntitiesDialog'
import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { buildRecipeProductItemIds, getRecipePrimaryProductRawName } from '@/hooks/use-products'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import {
  useCellInTableRevision,
  useStoreRevision,
  useTableRowIdsRevision,
} from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

type Mode = 'skill' | 'standard' | 'custom'

interface ModeOption {
  label: string
  value: Mode
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
const USER_PRICES_TABLE = ['userPrices'] as const
const GAME_DATA_TABLES = ['recipes'] as const

export function AddRecipeDialog({ visible, onHide, buildId, datasetId, existingRecipeIds }: Props) {
  const { t } = useTranslation()
  const { buildStore, gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()
  const recipeMgmt = useRecipeManagement(buildId)

  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)
  const userPricesRowIdsRev = useTableRowIdsRevision(buildStore, USER_PRICES_TABLE)
  // Toggling `userPrices.isOverride` on an existing row should invalidate the
  // recipe list (so a freshly-overridden item disappears from suggestions
  // without waiting for a row-id change).
  const isOverrideRev = useCellInTableRevision(buildStore, 'userPrices', 'isOverride')
  const gameDataRev = useStoreRevision(gameDataStore, GAME_DATA_TABLES)

  const { skillRecipes, standardRecipes, customRecipes } = useMemo(() => {
    const buildSkillIds = new Set<string>()
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId === buildId) {
        buildSkillIds.add(row.skillId as string)
      }
    }

    // Items the user has moved from Products to Materials. Recipes whose
    // primary product is one of these are useless to add (the solver
    // ignores them as a producer of that item) so hide them.
    const excludedItems = new Set<string>()
    for (const upId of buildStore.getRowIds('userPrices')) {
      const up = buildStore.getRow('userPrices', upId)
      if (up.buildId !== buildId) continue
      if (up.isOverride && up.priceMode === 'manual') {
        excludedItems.add(up.itemOrTagId as string)
      }
    }

    // Shared icon-resolution helper: builds the recipe→products index once
    // and resolves each recipe's primary product rawName the same way
    // buildProducts does, so the icon shown in the dialog matches the one
    // in the Products table.
    const productItemIdsByRecipeId = buildRecipeProductItemIds(gameDataStore)

    const skill: RecipeOption[] = []
    const standard: RecipeOption[] = []
    const custom: RecipeOption[] = []
    for (const rowId of gameDataStore.getRowIds('recipes')) {
      const recipe = gameDataStore.getRow('recipes', rowId)
      if (recipe.datasetId !== datasetId) continue
      if (existingRecipeIds.has(rowId)) continue
      const productIds = productItemIdsByRecipeId.get(rowId)
      const primaryProductId = productIds && productIds.length > 0 ? productIds[0] : ''
      if (primaryProductId && excludedItems.has(primaryProductId)) continue
      const name = getName('recipe', rowId) || (recipe.name as string)
      const rawName = getRecipePrimaryProductRawName(gameDataStore, rowId, productItemIdsByRecipeId)
      const skillName = resolveRecipeSkillName(gameDataStore, getName, recipe.skillId as string)
      const option: RecipeOption = {
        id: rowId,
        name,
        rawName,
        skillName,
        isCustom: !!recipe.isCustom,
      }
      if (recipe.isCustom) {
        custom.push(option)
        continue
      }
      standard.push(option)
      if (buildSkillIds.has(recipe.skillId as string)) {
        skill.push(option)
      }
    }

    const byName = (a: RecipeOption, b: RecipeOption) => compare(a.name, b.name)
    skill.sort(byName)
    standard.sort(byName)
    custom.sort(byName)
    return { skillRecipes: skill, standardRecipes: standard, customRecipes: custom }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildStore,
    gameDataStore,
    buildId,
    datasetId,
    existingRecipeIds,
    getName,
    buildRev,
    userPricesRowIdsRev,
    isOverrideRev,
    gameDataRev,
  ])

  const [mode, setMode] = useState<Mode>('skill')
  const [selected, setSelected] = useState<RecipeOption | undefined>(undefined)
  const [suggestions, setSuggestions] = useState<RecipeOption[]>([])
  const [manageCustomVisible, setManageCustomVisible] = useState(false)

  // Reset state and pick default mode whenever the dialog opens.
  // Intentionally only depends on `visible` — the user's toggle choice should
  // stick while the dialog is open, even if the underlying lists change.
  useEffect(() => {
    if (!visible) return
    setMode(skillRecipes.length === 0 ? 'standard' : 'skill')
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
        label: t('priceCalculator.addRecipeDialog.mode.standard'),
        value: 'standard',
      },
      {
        label: t('priceCalculator.addRecipeDialog.mode.custom'),
        value: 'custom',
      },
    ],
    [t, skillRecipes.length]
  )

  const activeRecipes = useMemo(() => {
    if (mode === 'skill') return skillRecipes
    if (mode === 'standard') return standardRecipes
    return customRecipes
  }, [mode, skillRecipes, standardRecipes, customRecipes])

  const searchRecipes = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase()
    const filtered = query
      ? activeRecipes.filter((r) => r.name.toLowerCase().includes(query))
      : activeRecipes.slice()
    setSuggestions(filtered)
  }

  const handleModeChange = (e: SelectButtonChangeEvent) => {
    if (!e.value) return
    setMode(e.value as Mode)
    setSelected(undefined)
    setSuggestions([])
  }

  const handleAdd = () => {
    if (!selected) return
    recipeMgmt.addRecipe(selected.id)
    onHide()
  }

  const itemTemplate = useCallback((item: RecipeOption) => <RecipeOptionItem option={item} />, [])

  const showCustomEmptyHint = mode === 'custom' && customRecipes.length === 0
  const showStandardEmptyHint =
    skillRecipes.length === 0 && mode === 'standard' && standardRecipes.length > 0

  const footer =
    mode === 'custom' ? (
      <div className="flex justify-content-between gap-2">
        <Button
          label={t('priceCalculator.addRecipeDialog.manageCustom')}
          icon="pi pi-wrench"
          outlined
          onClick={() => setManageCustomVisible(true)}
        />
        <div className="flex gap-2">
          <Button label={t('priceCalculator.addRecipeDialog.cancel')} outlined onClick={onHide} />
          <Button
            label={t('priceCalculator.addRecipeDialog.add')}
            disabled={!selected}
            onClick={handleAdd}
          />
        </div>
      </div>
    ) : (
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
    <>
      <Dialog
        header={t('priceCalculator.addRecipeDialog.title')}
        visible={visible}
        onHide={onHide}
        style={{ width: '52rem' }}
        modal
        dismissableMask
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
          {showStandardEmptyHint && (
            <small className="text-color-secondary">
              {t('priceCalculator.addRecipeDialog.noSkillRecipesHint')}
            </small>
          )}
          {showCustomEmptyHint && (
            <small className="text-color-secondary">
              {t('priceCalculator.addRecipeDialog.noCustomRecipesHint')}
            </small>
          )}
        </div>
      </Dialog>
      <CustomEntitiesDialog
        visible={manageCustomVisible}
        onHide={() => setManageCustomVisible(false)}
        datasetId={datasetId}
      />
    </>
  )
}
