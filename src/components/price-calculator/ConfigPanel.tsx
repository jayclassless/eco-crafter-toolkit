import { memo } from 'react'

import { CraftingTablesPanel } from './CraftingTablesPanel'
import { OptionsPanel } from './OptionsPanel'
import { SkillsPanel } from './SkillsPanel'

interface Props {
  buildId: string
  datasetId: string
  onDeleteBuild: () => void
}

// Memoized so unrelated PriceCalculator re-renders (notably the solver-result
// commit, which changes `computedPrices` but nothing this panel consumes)
// don't cascade into SkillsPanel / CraftingTablesPanel / OptionsPanel — each
// of which re-runs its own DataTable full of PrimeReact inputs. That cascade
// was the dominant ~800ms task after every build-store mutation.
function ConfigPanelImpl({ buildId, datasetId, onDeleteBuild }: Props) {
  return (
    <div className="flex flex-column gap-2">
      <SkillsPanel buildId={buildId} datasetId={datasetId} />
      <CraftingTablesPanel buildId={buildId} datasetId={datasetId} />
      <OptionsPanel buildId={buildId} onDeleteBuild={onDeleteBuild} />
    </div>
  )
}

export const ConfigPanel = memo(ConfigPanelImpl)
