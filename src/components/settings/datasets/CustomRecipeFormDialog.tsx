import { type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GroupedSinglePicker,
  type GroupedSinglePickerGroup,
} from '@/components/common/GroupedSinglePicker'
import { NumericField } from '@/components/common/NumericField'
import { TypeAheadPicker } from '@/components/common/TypeAheadPicker'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { defaultLocale } from '@/i18n/config'
import {
  createCustomRecipe,
  type CustomRecipeInput,
  updateCustomRecipe,
} from '@/lib/custom-entities'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import { validationErrorMessage } from './validation-error-message'

interface PickerOption {
  id: string
  name: string
  rawName: string
  isCustom?: boolean
}

type PickerGroup = GroupedSinglePickerGroup<PickerOption>

interface IngredientRow {
  // Stable per-row id used as the React key. Rows are deletable mid-list, so
  // keying by array index would let an InputText/picker's internal state
  // (focus, in-progress text, open dropdown) carry over to the wrong logical
  // row after a delete.
  id: string
  selection: PickerOption | null
  baseQuantity: number | null
  isReducedByModule: boolean
}

interface ProductRow {
  id: string
  selection: PickerOption | null
  quantity: number | null
}

const emptyIngredient = (): IngredientRow => ({
  id: generateId(),
  selection: null,
  baseQuantity: 1,
  // Most ingredients are reduced by upgrade modules in vanilla recipes; default on
  // and let the user untoggle static items (tools/molds) that aren't reduced.
  isReducedByModule: true,
})

const emptyProduct = (): ProductRow => ({ id: generateId(), selection: null, quantity: 1 })

interface Props {
  visible: boolean
  onHide: () => void
  datasetId: string
  /** When set, the form opens in edit mode and prefills from this recipe. */
  recipeId?: string
}

function filterGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  if (!query) return groups
  const out: PickerGroup[] = []
  for (const group of groups) {
    const items = group.items.filter((it) => it.name.toLowerCase().includes(query))
    if (items.length > 0) out.push({ ...group, items })
  }
  return out
}

function buildItemCandidates(
  gameDataStore: ReturnType<typeof useStores>['gameDataStore'],
  datasetId: string,
  getName: (entityType: string, entityId: string) => string,
  includeTags: boolean
): PickerOption[] {
  const out: PickerOption[] = []
  for (const id of gameDataStore.getRowIds('items')) {
    if (gameDataStore.getCell('items', id, 'datasetId') !== datasetId) continue
    const rawName = gameDataStore.getCell('items', id, 'name') as string
    const isTag = !!gameDataStore.getCell('items', id, 'isTag')
    if (isTag && !includeTags) continue
    const isCustom = !!gameDataStore.getCell('items', id, 'isCustom')
    const label = getName('item', id) || rawName
    out.push({ id, name: label, rawName, isCustom })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function CustomRecipeFormDialog({ visible, onHide, datasetId, recipeId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)

  const isEdit = !!recipeId

  const [name, setName] = useState('')
  const [craftingTableSel, setCraftingTableSel] = useState<PickerOption | null>(null)
  const [skillSel, setSkillSel] = useState<PickerOption | null>(null)
  const [requiredSkillLevel, setRequiredSkillLevel] = useState<number | null>(0)
  const [baseLaborCost, setBaseLaborCost] = useState<number | null>(0)
  const [baseCraftTime, setBaseCraftTime] = useState<number | null>(0)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const [skillSuggestions, setSkillSuggestions] = useState<PickerGroup[]>([])
  const [craftingTableSuggestions, setCraftingTableSuggestions] = useState<PickerGroup[]>([])

  // Profession label → display name. Skills with `profession === ''` are
  // themselves profession headers in Eco data, so name maps from a child
  // skill's `profession` value back to the localized header label.
  const professionLabelByRaw = useMemo(() => {
    const map = new Map<string, string>()
    for (const id of gameDataStore.getRowIds('skills')) {
      if (gameDataStore.getCell('skills', id, 'datasetId') !== datasetId) continue
      const rawName = gameDataStore.getCell('skills', id, 'name') as string
      const profession = gameDataStore.getCell('skills', id, 'profession') as string
      // Profession-header skills have empty `profession` and are keyed by
      // their own `name`. Child skills point to that name.
      if (!profession) {
        map.set(rawName, getName('skill', id) || rawName)
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDataStore, datasetId, getName, visible])

  const skillGroups = useMemo<PickerGroup[]>(() => {
    const byProf = new Map<string, { label: string; rawName: string; items: PickerOption[] }>()
    for (const id of gameDataStore.getRowIds('skills')) {
      if (gameDataStore.getCell('skills', id, 'datasetId') !== datasetId) continue
      const profession = gameDataStore.getCell('skills', id, 'profession') as string
      // Skip the profession-header skills themselves; they aren't selectable
      // as a recipe's required skill.
      if (!profession) continue
      const rawName = gameDataStore.getCell('skills', id, 'name') as string
      const label = getName('skill', id) || rawName
      const profLabel = professionLabelByRaw.get(profession) ?? profession
      let bucket = byProf.get(profession)
      if (!bucket) {
        bucket = { label: profLabel, rawName: profession, items: [] }
        byProf.set(profession, bucket)
      }
      bucket.items.push({ id, name: label, rawName })
    }
    return [...byProf.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ label, rawName, items }) => ({
        groupLabel: label,
        groupRawName: rawName,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDataStore, datasetId, getName, professionLabelByRaw, visible])

  const craftingTableGroups = useMemo<PickerGroup[]>(() => {
    // Group crafting tables by the professions whose recipes use them — same
    // grouping logic as `CraftingTablesPanel.searchTables`.
    const tableProfessions = new Map<string, Set<string>>()
    for (const id of gameDataStore.getRowIds('recipes')) {
      if (gameDataStore.getCell('recipes', id, 'datasetId') !== datasetId) continue
      const ctId = gameDataStore.getCell('recipes', id, 'craftingTableId') as string
      const skillId = gameDataStore.getCell('recipes', id, 'skillId') as string
      if (!ctId || !skillId) continue
      const profRaw =
        (gameDataStore.getCell('skills', skillId, 'profession') as string) ||
        (gameDataStore.getCell('skills', skillId, 'name') as string)
      let set = tableProfessions.get(ctId)
      if (!set) {
        set = new Set()
        tableProfessions.set(ctId, set)
      }
      set.add(profRaw)
    }

    const byProf = new Map<string, { label: string; rawName: string; items: PickerOption[] }>()
    for (const id of gameDataStore.getRowIds('craftingTables')) {
      if (gameDataStore.getCell('craftingTables', id, 'datasetId') !== datasetId) continue
      const rawName = gameDataStore.getCell('craftingTables', id, 'name') as string
      const label = getName('craftingTable', id) || rawName
      const profs = tableProfessions.get(id)
      const rawNames = profs && profs.size > 0 ? [...profs] : ['_Other']
      for (const profRaw of rawNames) {
        const profLabel =
          professionLabelByRaw.get(profRaw) ??
          (profRaw === '_Other' ? t('common.otherProfession') : profRaw)
        let bucket = byProf.get(profRaw)
        if (!bucket) {
          bucket = { label: profLabel, rawName: profRaw, items: [] }
          byProf.set(profRaw, bucket)
        }
        bucket.items.push({ id, name: label, rawName })
      }
    }

    return [...byProf.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ label, rawName, items }) => ({
        groupLabel: label,
        groupRawName: rawName,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDataStore, datasetId, getName, professionLabelByRaw, t, visible])

  const ingredientCandidates = useMemo(
    () => buildItemCandidates(gameDataStore, datasetId, getName, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, visible]
  )
  const productCandidates = useMemo(
    () => buildItemCandidates(gameDataStore, datasetId, getName, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, visible]
  )

  useEffect(() => {
    if (!visible) return
    setError('')
    if (!isEdit || !recipeId) {
      setName('')
      setCraftingTableSel(null)
      setSkillSel(null)
      setRequiredSkillLevel(0)
      setBaseLaborCost(0)
      setBaseCraftTime(0)
      setIngredients([emptyIngredient()])
      setProducts([emptyProduct()])
      return
    }
    const recipe = gameDataStore.getRow('recipes', recipeId)
    if (!recipe) return
    setName((recipe.name as string) ?? '')
    setRequiredSkillLevel((recipe.requiredSkillLevel as number) ?? 0)
    setBaseLaborCost((recipe.baseLaborCost as number) ?? 0)
    setBaseCraftTime((recipe.baseCraftTime as number) ?? 0)

    const ctId = (recipe.craftingTableId as string) ?? ''
    const ctRow = ctId ? gameDataStore.getRow('craftingTables', ctId) : null
    setCraftingTableSel(
      ctRow
        ? {
            id: ctId,
            name: getName('craftingTable', ctId) || (ctRow.name as string),
            rawName: ctRow.name as string,
          }
        : null
    )

    const skillId = (recipe.skillId as string) ?? ''
    const skillRow = skillId ? gameDataStore.getRow('skills', skillId) : null
    setSkillSel(
      skillRow
        ? {
            id: skillId,
            name: getName('skill', skillId) || (skillRow.name as string),
            rawName: skillRow.name as string,
          }
        : null
    )

    const elementReducedSet = new Set<string>()
    for (const mId of gameDataStore.getRowIds('modifiers')) {
      if (gameDataStore.getCell('modifiers', mId, 'targetType') !== 'elementQuantity') continue
      elementReducedSet.add(gameDataStore.getCell('modifiers', mId, 'targetId') as string)
    }
    const ings: IngredientRow[] = []
    const prods: ProductRow[] = []
    const elementRows: { id: string; row: ReturnType<typeof gameDataStore.getRow> }[] = []
    for (const reId of gameDataStore.getRowIds('recipeElements')) {
      const re = gameDataStore.getRow('recipeElements', reId)
      if (re.recipeId !== recipeId) continue
      elementRows.push({ id: reId, row: re })
    }
    elementRows.sort((a, b) => ((a.row.index as number) ?? 0) - ((b.row.index as number) ?? 0))
    for (const { id, row } of elementRows) {
      const itemId = row.itemOrTagId as string
      const itemRow = itemId ? gameDataStore.getRow('items', itemId) : null
      const selection: PickerOption | null = itemRow
        ? {
            id: itemId,
            name: getName('item', itemId) || (itemRow.name as string),
            rawName: itemRow.name as string,
            isCustom: !!itemRow.isCustom,
          }
        : null
      if (row.isProduct) {
        prods.push({
          id: generateId(),
          selection,
          quantity: Math.abs((row.baseQuantity as number) ?? 0),
        })
      } else {
        ings.push({
          id: generateId(),
          selection,
          baseQuantity: Math.abs((row.baseQuantity as number) ?? 0),
          isReducedByModule: elementReducedSet.has(id),
        })
      }
    }
    setIngredients(ings.length > 0 ? ings : [emptyIngredient()])
    setProducts(prods.length > 0 ? prods : [emptyProduct()])
  }, [visible, isEdit, recipeId, gameDataStore, getName])

  const updateIngredient = (idx: number, patch: Partial<IngredientRow>) => {
    setIngredients((rows) => rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }
  const updateProduct = (idx: number, patch: Partial<ProductRow>) => {
    setProducts((rows) => rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const searchSkills = (event: AutoCompleteCompleteEvent) =>
    setSkillSuggestions(filterGroups(skillGroups, event.query.toLowerCase()))
  const searchCraftingTables = (event: AutoCompleteCompleteEvent) =>
    setCraftingTableSuggestions(filterGroups(craftingTableGroups, event.query.toLowerCase()))

  const handleSubmit = async () => {
    setError('')
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('settings.customEntities.errors.nameRequired'))
      return
    }
    if (!craftingTableSel) {
      setError(t('settings.customEntities.errors.craftingTableRequired'))
      return
    }
    if (!skillSel) {
      setError(t('settings.customEntities.errors.skillRequired'))
      return
    }
    const ingPayload = ingredients
      .filter((r) => r.selection !== null)
      .map((r) => ({
        itemId: r.selection!.id,
        baseQuantity: r.baseQuantity ?? 0,
        isReducedByModule: r.isReducedByModule,
      }))
    const prodPayload = products
      .filter((r) => r.selection !== null)
      .map((r) => ({ itemId: r.selection!.id, quantity: r.quantity ?? 0 }))
    if (ingPayload.length === 0) {
      setError(t('settings.customEntities.errors.ingredientRequired'))
      return
    }
    if (prodPayload.length === 0) {
      setError(t('settings.customEntities.errors.productRequired'))
      return
    }
    const ingItemIds = new Set<string>()
    for (const i of ingPayload) {
      if (ingItemIds.has(i.itemId)) {
        setError(t('settings.customEntities.errors.duplicateIngredient'))
        return
      }
      if (i.baseQuantity <= 0) {
        setError(t('settings.customEntities.errors.ingredientQty'))
        return
      }
      ingItemIds.add(i.itemId)
    }
    const prodItemIds = new Set<string>()
    for (const p of prodPayload) {
      if (prodItemIds.has(p.itemId)) {
        setError(t('settings.customEntities.errors.duplicateProduct'))
        return
      }
      if (p.quantity <= 0) {
        setError(t('settings.customEntities.errors.productQty'))
        return
      }
      prodItemIds.add(p.itemId)
    }
    const input: CustomRecipeInput = {
      name: trimmedName,
      craftingTableId: craftingTableSel.id,
      skillId: skillSel.id,
      requiredSkillLevel: requiredSkillLevel ?? 0,
      baseLaborCost: baseLaborCost ?? 0,
      baseCraftTime: baseCraftTime ?? 0,
      ingredients: ingPayload,
      products: prodPayload,
    }
    setSubmitting(true)
    try {
      if (isEdit && recipeId) {
        await updateCustomRecipe(gameDataStore, recipeId, input, defaultLocale)
      } else {
        await createCustomRecipe(gameDataStore, datasetId, input, defaultLocale)
      }
      onHide()
    } catch (e) {
      setError(validationErrorMessage(e, t))
    } finally {
      setSubmitting(false)
    }
  }

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button
        label={t('settings.customEntities.cancel')}
        outlined
        onClick={onHide}
        disabled={submitting}
      />
      <Button
        label={t('settings.customEntities.save')}
        onClick={() => void handleSubmit()}
        loading={submitting}
      />
    </div>
  )

  return (
    <Dialog
      header={
        isEdit
          ? t('settings.customEntities.recipeFormEditTitle')
          : t('settings.customEntities.recipeFormCreateTitle')
      }
      visible={visible}
      onHide={onHide}
      style={{ width: '56rem' }}
      modal
      footer={footer}
    >
      <div className="flex flex-column gap-3">
        <div className="flex flex-column gap-1">
          <label htmlFor="custom-recipe-name" className="font-semibold">
            {t('settings.customEntities.fields.name')}
          </label>
          <InputText
            id="custom-recipe-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid">
          <div className="col-6 flex flex-column gap-1">
            <label className="font-semibold">
              {t('settings.customEntities.fields.craftingTable')}
            </label>
            <GroupedSinglePicker
              placeholder={t('settings.customEntities.fields.craftingTablePlaceholder')}
              value={craftingTableSel}
              suggestions={craftingTableSuggestions}
              completeMethod={searchCraftingTables}
              onChange={setCraftingTableSel}
            />
          </div>
          <div className="col-6 flex flex-column gap-1">
            <label className="font-semibold">{t('settings.customEntities.fields.skill')}</label>
            <GroupedSinglePicker
              placeholder={t('settings.customEntities.fields.skillPlaceholder')}
              value={skillSel}
              suggestions={skillSuggestions}
              completeMethod={searchSkills}
              onChange={setSkillSel}
            />
          </div>
          <div className="col-4 flex flex-column gap-1">
            <label className="font-semibold">
              {t('settings.customEntities.fields.requiredSkillLevel')}
            </label>
            <NumericField
              value={requiredSkillLevel}
              onChange={setRequiredSkillLevel}
              min={0}
              maxFractionDigits={0}
            />
          </div>
          <div className="col-4 flex flex-column gap-1">
            <label className="font-semibold">{t('settings.customEntities.fields.labor')}</label>
            <NumericField
              value={baseLaborCost}
              onChange={setBaseLaborCost}
              min={0}
              maxFractionDigits={2}
            />
          </div>
          <div className="col-4 flex flex-column gap-1">
            <label className="font-semibold">{t('settings.customEntities.fields.craftTime')}</label>
            <NumericField
              value={baseCraftTime}
              onChange={setBaseCraftTime}
              min={0}
              maxFractionDigits={2}
              suffix={t('settings.customEntities.fields.minutes')}
            />
          </div>
        </div>

        <div className="flex flex-column gap-2">
          <div className="flex justify-content-between align-items-center">
            <span className="font-semibold">{t('settings.customEntities.fields.ingredients')}</span>
            <Button
              label={t('settings.customEntities.addIngredient')}
              icon="pi pi-plus"
              size="small"
              outlined
              onClick={() => setIngredients((rows) => [...rows, emptyIngredient()])}
            />
          </div>
          {ingredients.map((row, idx) => (
            <div key={row.id} className="flex align-items-center gap-2">
              <div className="flex-grow-1">
                <TypeAheadPicker
                  placeholder={t('settings.customEntities.fields.itemPlaceholder')}
                  value={row.selection}
                  candidates={ingredientCandidates}
                  onChange={(v) => updateIngredient(idx, { selection: v })}
                />
              </div>
              <NumericField
                value={row.baseQuantity}
                onChange={(v) => updateIngredient(idx, { baseQuantity: v })}
                min={0}
                maxFractionDigits={3}
                style={{ width: '6rem' }}
              />
              <div className="flex align-items-center gap-1">
                <Checkbox
                  inputId={`ing-reduced-${idx}`}
                  checked={row.isReducedByModule}
                  onChange={(e) => updateIngredient(idx, { isReducedByModule: !!e.checked })}
                />
                <label htmlFor={`ing-reduced-${idx}`} className="text-sm">
                  {t('settings.customEntities.fields.reducedByModule')}
                </label>
              </div>
              <Button
                icon="pi pi-trash"
                severity="danger"
                outlined
                size="small"
                onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== idx))}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-column gap-2">
          <div className="flex justify-content-between align-items-center">
            <span className="font-semibold">{t('settings.customEntities.fields.products')}</span>
            <Button
              label={t('settings.customEntities.addProduct')}
              icon="pi pi-plus"
              size="small"
              outlined
              onClick={() => setProducts((rows) => [...rows, emptyProduct()])}
            />
          </div>
          {products.map((row, idx) => (
            <div key={row.id} className="flex align-items-center gap-2">
              <div className="flex-grow-1">
                <TypeAheadPicker
                  placeholder={t('settings.customEntities.fields.itemPlaceholder')}
                  value={row.selection}
                  candidates={productCandidates}
                  onChange={(v) => updateProduct(idx, { selection: v })}
                />
              </div>
              <NumericField
                value={row.quantity}
                onChange={(v) => updateProduct(idx, { quantity: v })}
                min={0}
                maxFractionDigits={3}
                style={{ width: '6rem' }}
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                outlined
                size="small"
                onClick={() => setProducts((rows) => rows.filter((_, i) => i !== idx))}
              />
            </div>
          ))}
        </div>

        {error && <small className="text-color-danger">{error}</small>}
      </div>
    </Dialog>
  )
}
