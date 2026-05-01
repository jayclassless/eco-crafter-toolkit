import { memo } from 'react'

import { CraftingTablesPanel } from './CraftingTablesPanel'
import { OptionsPanel } from './OptionsPanel'
import { SkillsPanel } from './SkillsPanel'

interface Props {
  buildId: string
  datasetId: string
}

// Memoized so unrelated PriceCalculator re-renders (notably the solver-result
// commit, which changes `computedPrices` but nothing this panel consumes)
// don't cascade into SkillsPanel / CraftingTablesPanel / OptionsPanel — each
// of which re-runs its own DataTable full of PrimeReact inputs. That cascade
// was the dominant ~800ms task after every build-store mutation.
function ConfigPanelImpl({ buildId, datasetId }: Props) {
  return (
    <div className="overflow-y-auto p-3 h-full">
      <div className="flex flex-column gap-2">
        <SkillsPanel buildId={buildId} datasetId={datasetId} />
        <CraftingTablesPanel buildId={buildId} datasetId={datasetId} />
        <OptionsPanel buildId={buildId} />
      </div>
    </div>
  )
}

export const ConfigPanel = memo(ConfigPanelImpl)
