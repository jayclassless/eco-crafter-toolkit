import { memo, type ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

// A labelled control in the optimizer's assumptions row. Its own module because
// the section keeps one component per file, and the config panel uses eight of
// these.
function OptimizerFieldImpl({ label, children }: Props) {
  return (
    <label className="flex flex-column gap-1">
      <span className="text-sm text-color-secondary">{label}</span>
      {children}
    </label>
  )
}

export const OptimizerField = memo(OptimizerFieldImpl)
