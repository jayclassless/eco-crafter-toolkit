import { InputNumber, type InputNumberChangeEvent } from 'primereact/inputnumber'
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
//
// Uses `onChange` rather than `onValueChange` so typed digits commit live,
// not only on blur. `onChange` also fires for the +/- spinner buttons, so
// the showButtons UX still works.
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
      onChange={(e: InputNumberChangeEvent) => onChange(userSkillId, e.value ?? 1)}
      min={1}
      max={maxLevel}
      showButtons
      inputStyle={{ width: '2.25rem', textAlign: 'center', padding: '0.25rem 0.375rem' }}
    />
  )
})
