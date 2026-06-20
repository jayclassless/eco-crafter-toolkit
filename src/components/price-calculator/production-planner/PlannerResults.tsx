import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Message } from 'primereact/message'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { ItemIcon } from '@/components/common/ItemIcon'
import { useLocalization } from '@/hooks/use-localization'
import type {
  PlannerQuantity,
  PlannerResult,
  PlannerStep,
  PlannerStepIO,
} from '@/lib/production-planner'
import type { GetNameFn } from '@/lib/recipe-modifiers'

interface Props {
  plan: PlannerResult | null
  targetName: string
  gameDataStore: Store
  getName: GetNameFn
}

export function PlannerResults({ plan, targetName, gameDataStore, getName }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()

  if (!plan) {
    return <Message severity="info" text={t('settings.productionPlanner.pickProduct')} />
  }
  if (plan.cyclic) {
    return <Message severity="error" text={t('settings.productionPlanner.cyclic')} />
  }

  const fmt = (n: number) => formatNumber(n, { maximumFractionDigits: 2 })

  const itemName = (itemId: string) =>
    getName('item', itemId) || ((gameDataStore.getRow('items', itemId)?.name as string) ?? itemId)

  const itemCell = (entry: PlannerStepIO | PlannerQuantity) => {
    const row = gameDataStore.getRow('items', entry.itemId)
    const rawName = (row?.name as string) ?? ''
    return (
      <div className="flex align-items-center gap-1">
        {(rawName || row?.isCustom) && (
          <ItemIcon item={{ name: rawName, isCustom: !!row?.isCustom }} size={20} />
        )}
        <span>
          {fmt(entry.qty)} {itemName(entry.itemId)}
        </span>
      </div>
    )
  }

  const ioList = (entries: PlannerStepIO[]) => (
    <div className="flex flex-column gap-1">
      {entries.map((e) => (
        <div key={e.itemId}>{itemCell(e)}</div>
      ))}
    </div>
  )

  const headline = plan.feasible
    ? t('settings.productionPlanner.canProduce', { qty: plan.producible, name: targetName })
    : plan.producible > 0
      ? t('settings.productionPlanner.shortOfDesired', { qty: plan.producible, name: targetName })
      : t('settings.productionPlanner.nothingProducible')

  return (
    <div className="flex flex-column gap-3">
      <Message severity={plan.feasible ? 'success' : 'warn'} text={headline} />

      {plan.steps.length > 0 && (
        <div className="flex flex-column gap-2">
          <span className="font-semibold">{t('settings.productionPlanner.stepsTitle')}</span>
          <DataTable value={plan.steps} dataKey="recipeId" size="small">
            <Column
              header={t('settings.productionPlanner.colStep')}
              body={(step: PlannerStep) =>
                getName('recipe', step.recipeId) ||
                ((gameDataStore.getRow('recipes', step.recipeId)?.name as string) ?? step.recipeId)
              }
            />
            <Column
              header={t('settings.productionPlanner.colCrafts')}
              style={{ width: '6rem' }}
              body={(step: PlannerStep) => fmt(step.crafts)}
            />
            <Column
              header={t('settings.productionPlanner.colConsumes')}
              body={(step: PlannerStep) => ioList(step.consumes)}
            />
            <Column
              header={t('settings.productionPlanner.colProduces')}
              body={(step: PlannerStep) => ioList(step.produces)}
            />
          </DataTable>
        </div>
      )}

      {plan.missing.length > 0 && (
        <div className="flex flex-column gap-2">
          <span className="font-semibold">{t('settings.productionPlanner.missingTitle')}</span>
          <div className="flex flex-column gap-1">
            {plan.missing.map((m) => (
              <div key={m.itemId}>{itemCell(m)}</div>
            ))}
          </div>
        </div>
      )}

      {plan.leftovers.length > 0 && (
        <div className="flex flex-column gap-2">
          <span className="font-semibold">{t('settings.productionPlanner.leftoversTitle')}</span>
          <div className="flex flex-column gap-1">
            {plan.leftovers.map((l) => (
              <div key={l.itemId}>{itemCell(l)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
