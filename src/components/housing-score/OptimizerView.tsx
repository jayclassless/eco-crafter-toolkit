import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useCellValue, useStoreRevision } from '@/hooks/use-store-revision'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { collectSkillOptions } from '@/lib/skill-options'
import { useStores } from '@/stores/providers'

import type { DonutDatum } from './housing-donut-layout'
import { optimizeHousing } from './housing-optimize'
import {
  buildOptimizerCatalog,
  parsePowerTypes,
  parseSkillSelection,
  reachableItemIdsForSkills,
  serializePowerTypes,
  serializeSkillSelection,
  toOptimizerInput,
} from './housing-optimizer-data'
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from './housing-optimizer-types'
import { OptimizerConfigPanel } from './OptimizerConfigPanel'
import { OptimizerRoomCard } from './OptimizerRoomCard'
import { OptimizerSummary } from './OptimizerSummary'

interface Props {
  datasetId: string
}

const D = DEFAULT_OPTIMIZER_CONFIG

// Works out the highest-scoring set of furnishings for a Residence deed under
// the constraints the player sets, and shows the resulting score, its split by
// room category, and what to place in each room.
export function OptimizerView({ datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, uiStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()

  const tier = useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerTier') ?? D.tier
  const maxFurnishingRepeats =
    useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerMaxFurnishingRepeats') ??
    D.maxFurnishingRepeats
  const minFurnishingContribution =
    useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerMinFurnishingContribution') ??
    D.minFurnishingContribution
  const residents =
    useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerResidents') ?? D.residents
  const maxRoomRepeat =
    useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerMaxRoomRepeat') ??
    D.maxRoomRepeat
  const minRoomContribution =
    useCellValue<number>(uiStore, 'uiState', 'main', 'housingOptimizerMinRoomContribution') ??
    D.minRoomContribution
  const powerRaw =
    useCellValue<string>(uiStore, 'uiState', 'main', 'housingOptimizerPower') ??
    serializePowerTypes(D.power)
  // Stored as skill names rather than ids so it survives a dataset switch; see
  // parseSkillSelection.
  const skillsRaw =
    useCellValue<string>(uiStore, 'uiState', 'main', 'housingOptimizerSkills') ?? '*'

  const rev = useStoreRevision(gameDataStore, ['items', 'roomCategories', 'roomTiers', 'recipes'])

  const catalog = useMemo(
    () => buildOptimizerCatalog(gameDataStore, datasetId, getName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, rev]
  )

  // Every crafting skill is selectable here, not just the ones that craft a
  // furnishing: the constraint resolves through the full crafting tree, so a
  // skill like Mining is load-bearing via the materials it gates even though it
  // makes no furnishing itself and would show a count of 0.
  const craftingSkillIds = useMemo(
    () => getGameDataIndexes(gameDataStore).craftingSkillIdsByDatasetId.get(datasetId) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, rev]
  )

  const skills = useMemo(
    () =>
      collectSkillOptions(
        catalog.furnishings,
        gameDataStore,
        datasetId,
        getName,
        compare,
        {
          unskilled: t('common.unskilled'),
          otherProfession: t('common.otherProfession'),
        },
        craftingSkillIds
      ),
    [catalog.furnishings, gameDataStore, datasetId, getName, compare, t, craftingSkillIds]
  )

  // Both of these are memoized on their scalar fields on purpose. The solver is
  // pure, so a fresh object identity per render costs no correctness — but it
  // would re-run the whole solve on every unrelated re-render in the tree.
  const power = useMemo(() => parsePowerTypes(powerRaw), [powerRaw])
  const skillIds = useMemo(() => parseSkillSelection(skillsRaw, skills), [skillsRaw, skills])
  const config = useMemo<OptimizerConfig>(
    () => ({
      tier,
      skillIds,
      maxFurnishingRepeats,
      minFurnishingContribution,
      residents,
      maxRoomRepeat,
      minRoomContribution,
      power,
    }),
    [
      tier,
      skillIds,
      maxFurnishingRepeats,
      minFurnishingContribution,
      residents,
      maxRoomRepeat,
      minRoomContribution,
      power,
    ]
  )

  // Memoized on the skill selection alone: the closure walks every recipe in
  // the dataset, so it must not re-run when an unrelated knob (residents, room
  // repeats) changes.
  const reachableItemIds = useMemo(
    () => reachableItemIdsForSkills(gameDataStore, datasetId, skillIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, skillIds, rev]
  )

  const result = useMemo(
    () => optimizeHousing(toOptimizerInput(config, catalog, reachableItemIds), catalog),
    [config, catalog, reachableItemIds]
  )

  const categoryLabels = useMemo(
    () => new Map(catalog.categories.map((c) => [c.name, getName('roomCategory', c.id) || c.name])),
    [catalog.categories, getName]
  )
  const categoryColors = useMemo(
    () => new Map(catalog.categories.map((c) => [c.name, c.color])),
    [catalog.categories]
  )

  const segments = useMemo<DonutDatum[]>(
    () =>
      result.byCategory.map((c) => ({
        key: c.categoryName,
        label: categoryLabels.get(c.categoryName) ?? c.categoryName,
        color: categoryColors.get(c.categoryName) ?? '',
        value: c.value,
      })),
    [result.byCategory, categoryLabels, categoryColors]
  )

  const onConfigChange = useCallback(
    (patch: Partial<OptimizerConfig>) => {
      uiStore.transaction(() => {
        if ('skillIds' in patch)
          uiStore.setCell(
            'uiState',
            'main',
            'housingOptimizerSkills',
            serializeSkillSelection(patch.skillIds ?? null, skills)
          )
        if (patch.tier != null)
          uiStore.setCell('uiState', 'main', 'housingOptimizerTier', patch.tier)
        if (patch.maxFurnishingRepeats != null)
          uiStore.setCell(
            'uiState',
            'main',
            'housingOptimizerMaxFurnishingRepeats',
            patch.maxFurnishingRepeats
          )
        if (patch.minFurnishingContribution != null)
          uiStore.setCell(
            'uiState',
            'main',
            'housingOptimizerMinFurnishingContribution',
            patch.minFurnishingContribution
          )
        if (patch.residents != null)
          uiStore.setCell('uiState', 'main', 'housingOptimizerResidents', patch.residents)
        if (patch.maxRoomRepeat != null)
          uiStore.setCell('uiState', 'main', 'housingOptimizerMaxRoomRepeat', patch.maxRoomRepeat)
        if (patch.minRoomContribution != null)
          uiStore.setCell(
            'uiState',
            'main',
            'housingOptimizerMinRoomContribution',
            patch.minRoomContribution
          )
        if (patch.power)
          uiStore.setCell(
            'uiState',
            'main',
            'housingOptimizerPower',
            serializePowerTypes(patch.power)
          )
      })
    },
    [uiStore, skills]
  )

  if (catalog.furnishings.length === 0) {
    return <div className="text-color-secondary p-4 text-center">{t('housingScore.empty')}</div>
  }

  const hasResult = result.rooms.length > 0 && result.perResident > 0

  return (
    <div className="flex flex-column gap-3 overflow-y-auto overflow-x-hidden">
      {/* Assumptions on the left, summary pinned right. The row stretches
          rather than starting its items, so the summary can center itself
          against the taller assumptions block. `flex-wrap` collapses the two
          into a single stack on a narrow viewport rather than letting the
          summary squeeze. */}
      <div className="flex gap-4 flex-wrap">
        <OptimizerConfigPanel
          config={config}
          skills={skills}
          tiers={catalog.tiers}
          onChange={onConfigChange}
        />

        {/* `pr-4` keeps the donut off the scroll container's scrollbar. */}
        <div
          className="align-items-center justify-content-end flex flex-1 pr-4"
          style={{ minWidth: '22rem' }}
        >
          {hasResult ? (
            <OptimizerSummary
              perResident={result.perResident}
              houseTotal={result.houseTotal}
              residents={config.residents}
              segments={segments}
            />
          ) : (
            <div className="text-color-secondary flex-1 p-4 text-center">
              {t('housingScore.optimizer.emptyResult')}
            </div>
          )}
        </div>
      </div>

      {/* CSS grid rather than PrimeFlex's `grid`: that one uses negative
          margins, which push past the scroll container and raise a
          horizontal scrollbar. */}
      {hasResult && (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(34rem, 1fr))',
          }}
        >
          {result.rooms.map((room) => (
            <OptimizerRoomCard
              key={room.categoryName}
              room={room}
              displayName={categoryLabels.get(room.categoryName) ?? room.categoryName}
              color={categoryColors.get(room.categoryName) ?? ''}
              categoryLabels={categoryLabels}
            />
          ))}
        </div>
      )}
    </div>
  )
}
