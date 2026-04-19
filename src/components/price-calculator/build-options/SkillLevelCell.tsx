import { InputNumber, type InputNumberValueChangeEvent } from 'primereact/inputnumber'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  buildStore: Store
  userSkillId: string
  maxLevel: number
  onChange: (userSkillId: string, level: number) => void
}

// Subscribes to its own userSkills.level cell so typing in the InputNumber
// re-renders only this one component — no DataTable rebuild. Memoized on
// userSkillId so unrelated parent re-renders also skip.
export const SkillLevelCell = memo(function SkillLevelCell({
  buildStore,
  userSkillId,
  maxLevel,
  onChange,
}: Props) {
  const level = useCellValue<number>(buildStore, 'userSkills', userSkillId, 'level') ?? 1
  return (
    <InputNumber
      value={level}
      onValueChange={(e: InputNumberValueChangeEvent) => onChange(userSkillId, e.value ?? 1)}
      min={1}
      max={maxLevel}
      showButtons
      size={1}
    />
  )
})
