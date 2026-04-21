import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { OverlayPanel } from 'primereact/overlaypanel'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface TagFilterOption {
  id: string
  name: string
  kind: 'tag' | 'part'
}

interface Props {
  skillOptions: { id: string; name: string }[]
  hiddenSkills: Set<string>
  showUnskilled: boolean
  onToggleSkill: (id: string) => void
  onToggleUnskilled: () => void
  onSetAllSkills: (hideAll: boolean) => void
  craftingTableOptions: { id: string; name: string }[]
  hiddenCraftingTables: Set<string>
  onToggleCraftingTable: (id: string) => void
  onSetAllCraftingTables: (hideAll: boolean) => void
  tagOptions: TagFilterOption[]
  hiddenTags: Set<string>
  showParts: boolean
  showUntagged: boolean
  onToggleTag: (id: string) => void
  onTogglePart: () => void
  onToggleUntagged: () => void
  onSetAllTags: (hideAll: boolean) => void
  onlyLevelAccessible: boolean
  onToggleOnlyLevelAccessible: () => void
}

export const RecipeFilterButton = memo(function RecipeFilterButton({
  skillOptions,
  hiddenSkills,
  showUnskilled,
  onToggleSkill,
  onToggleUnskilled,
  onSetAllSkills,
  craftingTableOptions,
  hiddenCraftingTables,
  onToggleCraftingTable,
  onSetAllCraftingTables,
  tagOptions,
  hiddenTags,
  showParts,
  showUntagged,
  onToggleTag,
  onTogglePart,
  onToggleUntagged,
  onSetAllTags,
  onlyLevelAccessible,
  onToggleOnlyLevelAccessible,
}: Props) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const isAnyHidden =
    hiddenSkills.size > 0 ||
    !showUnskilled ||
    hiddenCraftingTables.size > 0 ||
    hiddenTags.size > 0 ||
    !showParts ||
    !showUntagged ||
    onlyLevelAccessible
  return (
    <>
      <Button
        icon={isAnyHidden ? 'pi pi-filter-fill' : 'pi pi-filter'}
        text={!isAnyHidden}
        size="small"
        aria-label={t('priceCalculator.products.recipeFilter.label')}
        tooltip={t('priceCalculator.products.recipeFilter.tooltip')}
        tooltipOptions={{ position: 'bottom' }}
        onClick={(e) => op.current?.toggle(e)}
      />
      <OverlayPanel ref={op}>
        <div
          className="flex flex-column gap-3"
          style={{ minWidth: '34rem' }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex gap-4">
            <div className="flex flex-column gap-2 flex-1">
              <div className="font-semibold text-sm">
                {t('priceCalculator.products.recipeFilter.skillSection')}
              </div>
              <div className="flex gap-2">
                <Button
                  label={t('priceCalculator.products.recipeFilter.all')}
                  size="small"
                  text
                  onClick={() => onSetAllSkills(false)}
                />
                <Button
                  label={t('priceCalculator.products.recipeFilter.none')}
                  size="small"
                  text
                  onClick={() => onSetAllSkills(true)}
                />
              </div>
              {skillOptions.map((opt) => {
                const inputId = `skill-filter-${opt.id}`
                return (
                  <div key={opt.id} className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={inputId}
                      checked={!hiddenSkills.has(opt.id)}
                      onChange={() => onToggleSkill(opt.id)}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer">
                      {opt.name}
                    </label>
                  </div>
                )
              })}
              <div className="flex align-items-center gap-2">
                <Checkbox
                  inputId="skill-filter-unskilled"
                  checked={showUnskilled}
                  onChange={onToggleUnskilled}
                />
                <label htmlFor="skill-filter-unskilled" className="text-sm cursor-pointer">
                  {t('priceCalculator.products.recipeFilter.unskilled')}
                </label>
              </div>
            </div>
            <div className="flex flex-column gap-2 flex-1">
              <div className="font-semibold text-sm">
                {t('priceCalculator.products.recipeFilter.craftingTableSection')}
              </div>
              <div className="flex gap-2">
                <Button
                  label={t('priceCalculator.products.recipeFilter.all')}
                  size="small"
                  text
                  onClick={() => onSetAllCraftingTables(false)}
                />
                <Button
                  label={t('priceCalculator.products.recipeFilter.none')}
                  size="small"
                  text
                  onClick={() => onSetAllCraftingTables(true)}
                />
              </div>
              {craftingTableOptions.map((opt) => {
                const inputId = `crafting-table-filter-${opt.id}`
                return (
                  <div key={opt.id} className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={inputId}
                      checked={!hiddenCraftingTables.has(opt.id)}
                      onChange={() => onToggleCraftingTable(opt.id)}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer">
                      {opt.name}
                    </label>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-column gap-2 flex-1">
              <div className="font-semibold text-sm">
                {t('priceCalculator.products.recipeFilter.tagSection')}
              </div>
              <div className="flex gap-2">
                <Button
                  label={t('priceCalculator.products.recipeFilter.all')}
                  size="small"
                  text
                  onClick={() => onSetAllTags(false)}
                />
                <Button
                  label={t('priceCalculator.products.recipeFilter.none')}
                  size="small"
                  text
                  onClick={() => onSetAllTags(true)}
                />
              </div>
              {tagOptions.map((opt) => {
                const inputId = `tag-filter-${opt.kind}-${opt.id}`
                const checked = opt.kind === 'part' ? showParts : !hiddenTags.has(opt.id)
                return (
                  <div key={inputId} className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={inputId}
                      checked={checked}
                      onChange={() => (opt.kind === 'part' ? onTogglePart() : onToggleTag(opt.id))}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer white-space-nowrap">
                      {opt.name}
                    </label>
                  </div>
                )
              })}
              <div className="flex align-items-center gap-2">
                <Checkbox
                  inputId="tag-filter-untagged"
                  checked={showUntagged}
                  onChange={onToggleUntagged}
                />
                <label
                  htmlFor="tag-filter-untagged"
                  className="text-sm cursor-pointer white-space-nowrap"
                >
                  {t('priceCalculator.products.recipeFilter.untagged')}
                </label>
              </div>
            </div>
          </div>
          <div className="flex align-items-center gap-2 border-top-1 surface-border pt-2">
            <Checkbox
              inputId="recipe-filter-only-level-accessible"
              checked={onlyLevelAccessible}
              onChange={onToggleOnlyLevelAccessible}
            />
            <label htmlFor="recipe-filter-only-level-accessible" className="text-sm cursor-pointer">
              {t('priceCalculator.products.onlyLevelAccessible')}
            </label>
          </div>
        </div>
      </OverlayPanel>
    </>
  )
})
