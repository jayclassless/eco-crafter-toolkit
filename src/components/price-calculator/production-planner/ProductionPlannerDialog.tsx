import { Dialog } from 'primereact/dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { TypeAheadPicker } from '@/components/common/TypeAheadPicker'
import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useSolverSnapshot } from '@/hooks/use-solver-snapshot'
import { planProduction } from '@/lib/production-planner'
import { useStores } from '@/stores/providers'
import type { SolverOutput } from '@/types/solver'

import { PlannerInventoryEditor } from './PlannerInventoryEditor'
import { PlannerResults } from './PlannerResults'
import { buildPlannerData, type PlannerItemOption } from './production-planner-data'

interface Props {
  visible: boolean
  onHide: () => void
  buildId: string
  datasetId: string
  /** Live solver output — used to resolve which recipe each product uses. */
  solverOutput: SolverOutput | null
}

export function ProductionPlannerDialog({
  visible,
  onHide,
  buildId,
  datasetId,
  solverOutput,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()
  const { buildSnapshot } = useSolverSnapshot()

  const [targetOption, setTargetOption] = useState<PlannerItemOption | null>(null)
  const [desiredQty, setDesiredQty] = useState<number | null>(null)
  const [inventory, setInventory] = useState<Record<string, number>>({})
  const [resetSignal, setResetSignal] = useState(0)

  // Reset to a clean slate each time the dialog opens.
  useEffect(() => {
    if (!visible) return
    setTargetOption(null)
    setDesiredQty(null)
    setInventory({})
    setResetSignal((n) => n + 1)
  }, [visible])

  // Snapshot the build + game data once per open. The planner reflects state at
  // open time (it's a what-if tool, not a live view).
  const plannerData = useMemo(() => {
    if (!visible) return null
    const snapshot = buildSnapshot(buildId, datasetId)
    if (!snapshot) return null
    return buildPlannerData(gameDataStore, datasetId, snapshot, solverOutput, getName, compare)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, buildId, datasetId, buildSnapshot, gameDataStore, getName, compare, solverOutput])

  const targetItemId = targetOption?.id

  const plan = useMemo(() => {
    if (!plannerData || !targetItemId) return null
    return planProduction({
      targetItemId,
      desiredQuantity: desiredQty != null && desiredQty > 0 ? desiredQty : null,
      inventory,
      recipeForItem: plannerData.recipeForItem,
      tagMembers: plannerData.tagMembers,
      isTag: plannerData.isTag,
    })
  }, [plannerData, targetItemId, desiredQty, inventory])

  const onInventoryChange = useCallback((next: Record<string, number>) => setInventory(next), [])

  const targetName = targetOption?.name ?? ''

  return (
    <Dialog
      header={t('settings.productionPlanner.title')}
      visible={visible}
      onHide={onHide}
      style={{ width: '70%' }}
      modal
      dismissableMask
      maximizable
    >
      <div className="flex flex-column gap-4">
        <div className="flex flex-column gap-2">
          <label className="font-semibold">{t('settings.productionPlanner.targetLabel')}</label>
          <div className="flex align-items-center gap-2 flex-wrap">
            <div className="flex-1">
              <TypeAheadPicker
                placeholder={t('settings.productionPlanner.targetPlaceholder')}
                value={targetOption}
                candidates={plannerData?.targetOptions ?? []}
                onChange={setTargetOption}
              />
            </div>
            <NumericField
              value={desiredQty}
              onChange={setDesiredQty}
              min={0}
              placeholder={t('settings.productionPlanner.desiredPlaceholder')}
              style={{ width: '10rem' }}
            />
          </div>
        </div>

        <PlannerInventoryEditor
          key={resetSignal}
          options={plannerData?.itemOptions ?? []}
          onInventoryChange={onInventoryChange}
        />

        <PlannerResults
          plan={plan}
          targetName={targetName}
          gameDataStore={gameDataStore}
          getName={getName}
        />
      </div>
    </Dialog>
  )
}
