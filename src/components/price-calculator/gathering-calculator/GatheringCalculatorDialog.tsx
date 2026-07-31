import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Message } from 'primereact/message'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import { type PriceSignal, usePriceCell } from '@/hooks/use-prices-signal'
import { useSettings } from '@/hooks/use-settings'
import { computeGathering, type GatheringTalentState } from '@/lib/gathering-calc'
import { useStores } from '@/stores/providers'

import {
  availableTalents,
  buildGatheringCatalog,
  defaultToolFor,
  findArrowItemId,
  findUserPriceId,
  retainTalents,
  seedGatheringControls,
  shouldReseedSkillLevel,
  toolsForKind,
} from './gathering-data'
import { GatheringAssumptionsPanel } from './GatheringAssumptionsPanel'
import { GatheringCostBreakdown } from './GatheringCostBreakdown'
import { GatheringTalentToggles } from './GatheringTalentToggles'
import { GatheringTargetPicker } from './GatheringTargetPicker'
import { GatheringToolInputs } from './GatheringToolInputs'

interface Props {
  visible: boolean
  onHide: () => void
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
  /** Preselects a target when opened from a Materials row action. */
  initialItemId?: string
}

/**
 * Estimates what it costs to gather a raw material from the world, and applies
 * the result as that item's manual price.
 *
 * Read-only against game data; the only write is the Apply button, which goes
 * through `usePriceManagement.setPrice` and therefore flips the item into
 * `manual` price mode so the solver treats it as authoritative.
 */
export function GatheringCalculatorDialog({
  visible,
  onHide,
  buildId,
  datasetId,
  priceSignal,
  initialItemId,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { formatPrice } = useLocalization()
  const { setPrice } = usePriceManagement(buildId)
  const { getSettingsRowId, setSetting } = useSettings(buildId)

  const [itemId, setItemId] = useState('')
  const [speciesId, setSpeciesId] = useState('')
  const [toolItemId, setToolItemId] = useState('')
  const [skillLevel, setSkillLevel] = useState(0)
  const [talents, setTalents] = useState<GatheringTalentState | null>(null)
  const [clothingIds, setClothingIds] = useState<string[]>([])
  const [logsPerTree, setLogsPerTree] = useState(0)
  const [hitRate, setHitRate] = useState(1)
  const [headshot, setHeadshot] = useState(false)
  const [arrowPriceOverride, setArrowPriceOverride] = useState<number | null>(null)
  const [applied, setApplied] = useState('')

  const catalog = useMemo(
    () => buildGatheringCatalog(gameDataStore, datasetId, getName),
    [gameDataStore, datasetId, getName]
  )

  const settingsRowId = getSettingsRowId()
  const storedPickupCalories =
    (buildStore.getCell('userSettings', settingsRowId, 'caloriesPerRubblePickup') as number) ?? 1
  const calorieCost =
    (buildStore.getCell('userSettings', settingsRowId, 'calorieCost') as number) ?? 0

  const arrowItemId = useMemo(
    () => findArrowItemId(gameDataStore, datasetId),
    [gameDataStore, datasetId]
  )
  const solvedArrowPrice = usePriceCell(priceSignal, arrowItemId, 'costPrice')

  const selected = itemId ? (catalog.byItemId.get(itemId) ?? null) : null
  const tools = selected ? toolsForKind(catalog.tools, selected.kind) : []
  const tool = tools.find((x) => x.itemId === toolItemId) ?? null

  // Selecting a target re-seeds the tool, skill level and talents from the
  // build, since all three depend on which tool the new target needs.
  const selectTarget = useCallback(
    (nextItemId: string) => {
      setItemId(nextItemId)
      setApplied('')
      const option = nextItemId ? catalog.byItemId.get(nextItemId) : null
      if (!option) {
        setToolItemId('')
        setSpeciesId('')
        return
      }
      const nextTool = defaultToolFor(catalog.tools, option.kind)
      setToolItemId(nextTool?.itemId ?? '')
      const seeded = seedGatheringControls(
        gameDataStore,
        buildStore,
        buildId,
        datasetId,
        option.kind,
        nextTool
      )
      setSkillLevel(seeded.skillLevel)
      setTalents(seeded.talents)

      const species = option.species?.[0] ?? null
      setSpeciesId(species?.id ?? '')
      // Yield is Min + (Max - Min) x growthPercent, so a fully grown tree gives
      // the max. That is what people actually chop, so it is the default; the
      // range is shown next to the field for younger trees.
      setLogsPerTree(species ? Math.max(1, Math.round(species.logsPerTreeMax)) : 0)
    },
    [catalog, gameDataStore, buildStore, buildId, datasetId]
  )

  // Reset on open. `initialItemId` is safe in the deps because the caller sets
  // it before flipping `visible`, and the dialog is modal.
  useEffect(() => {
    if (!visible) return
    setApplied('')
    setClothingIds([])
    setHitRate(1)
    setHeadshot(false)
    setArrowPriceOverride(null)
    selectTarget(initialItemId && catalog.byItemId.has(initialItemId) ? initialItemId : '')
    // selectTarget is stable for a given catalog; re-running on every identity
    // change would clobber the user's edits mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialItemId])

  const changeTool = useCallback(
    (nextToolItemId: string) => {
      setToolItemId(nextToolItemId)
      if (!selected) return
      const nextTool = catalog.tools.find((x) => x.itemId === nextToolItemId) ?? null
      const seeded = seedGatheringControls(
        gameDataStore,
        buildStore,
        buildId,
        datasetId,
        selected.kind,
        nextTool
      )
      if (shouldReseedSkillLevel(tool, nextTool)) setSkillLevel(seeded.skillLevel)
      setTalents((prev) =>
        prev ? retainTalents(prev, seeded.talents, selected.kind, nextTool) : seeded.talents
      )
    },
    [catalog, selected, tool, gameDataStore, buildStore, buildId, datasetId]
  )

  const clothingMultiplier = useMemo(() => {
    const rates = catalog.clothing
      .filter((c) => clothingIds.includes(c.itemId))
      .reduce((sum, c) => sum + c.calorieRate, 0)
    return 1 + rates
  }, [catalog.clothing, clothingIds])

  const species =
    selected?.species?.find((s) => s.id === speciesId) ?? selected?.species?.[0] ?? null
  const arrowPrice = arrowPriceOverride ?? solvedArrowPrice ?? 0

  const result = useMemo(() => {
    if (!selected || !tool || !talents) return null
    const target =
      selected.kind === 'log' && species
        ? { ...selected.target, treeHealth: species.treeHealth }
        : selected.target
    return computeGathering({
      target,
      tool: tool.tool,
      skillLevel,
      talents,
      clothingCalorieMultiplier: clothingMultiplier,
      calorieCost,
      caloriesPerRubblePickup: storedPickupCalories,
      logsPerTree,
      hitRate,
      headshot,
      arrowPrice,
    })
  }, [
    selected,
    tool,
    talents,
    species,
    skillLevel,
    clothingMultiplier,
    calorieCost,
    storedPickupCalories,
    logsPerTree,
    hitRate,
    headshot,
    arrowPrice,
  ])

  const skillName = tool?.calorieSkillId
    ? getName('skill', tool.calorieSkillId) ||
      ((gameDataStore.getCell('skills', tool.calorieSkillId, 'name') as string) ?? '')
    : ''

  const handleApply = () => {
    if (!result || !selected) return
    setPrice(
      selected.itemId,
      result.pricePerItem,
      findUserPriceId(buildStore, buildId, selected.itemId)
    )
    setApplied(selected.itemId)
  }

  const hasGatheringData = catalog.options.length > 0 && catalog.tools.length > 0

  const footer = (
    <div className="flex align-items-center justify-content-end gap-2">
      {applied && applied === selected?.itemId && (
        <Message
          severity="success"
          text={t('settings.gatheringCalculator.applied', { name: selected.name })}
          className="mr-auto"
        />
      )}
      <Button label={t('common.close')} text onClick={onHide} />
      <Button
        label={t('settings.gatheringCalculator.apply')}
        icon="pi pi-check"
        disabled={!result}
        onClick={handleApply}
      />
    </div>
  )

  return (
    <Dialog
      header={t('settings.gatheringCalculator.title')}
      visible={visible}
      onHide={onHide}
      style={{ width: '60%' }}
      modal
      dismissableMask
      maximizable
      footer={footer}
    >
      {!hasGatheringData ? (
        // An installed dataset from before gathering extraction. Say so rather
        // than rendering an empty picker or a pile of zeros.
        <Message severity="warn" text={t('settings.gatheringCalculator.noData')} />
      ) : (
        <div className="flex flex-column gap-4">
          <GatheringTargetPicker
            options={catalog.options}
            selected={selected}
            onSelect={selectTarget}
            speciesId={speciesId}
            onSelectSpecies={setSpeciesId}
          />

          {selected && (
            <>
              <GatheringToolInputs
                tools={tools}
                selectedToolId={toolItemId}
                onSelectTool={changeTool}
                skillName={skillName}
                skillLevel={skillLevel}
                onSkillLevel={setSkillLevel}
                clothing={catalog.clothing}
                selectedClothingIds={clothingIds}
                onSelectClothing={setClothingIds}
                clothingMultiplier={clothingMultiplier}
              />

              {talents && (
                <GatheringTalentToggles
                  talents={talents}
                  available={availableTalents(selected.kind, tool)}
                  onChange={setTalents}
                />
              )}

              <GatheringAssumptionsPanel
                kind={selected.kind}
                caloriesPerRubblePickup={storedPickupCalories}
                onCaloriesPerRubblePickup={(v) => setSetting('caloriesPerRubblePickup', v)}
                logsPerTree={logsPerTree}
                onLogsPerTree={setLogsPerTree}
                species={species}
                hitRate={hitRate}
                onHitRate={setHitRate}
                headshot={headshot}
                onHeadshot={setHeadshot}
                arrowPrice={arrowPrice}
                onArrowPrice={setArrowPriceOverride}
              />

              {calorieCost <= 0 && (
                // Every number here is calories x $/1000cal, so a zero rate
                // makes the whole estimate zero.
                <Message severity="warn" text={t('settings.gatheringCalculator.noCalorieCost')} />
              )}

              {result ? (
                <GatheringCostBreakdown
                  result={result}
                  kind={selected.kind}
                  itemName={selected.name}
                />
              ) : (
                <Message severity="info" text={t('settings.gatheringCalculator.needsInput')} />
              )}

              {result && (
                <div className="text-right font-medium">
                  {t('settings.gatheringCalculator.pricePerUnit', {
                    price: formatPrice(result.pricePerItem),
                    name: selected.name,
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  )
}
