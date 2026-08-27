import { memo, type ReactNode } from 'react'

/** Hook for the panel's single shared `<Tooltip>`; also what the icon is
 * styled by. The panel binds `.optimizer-field-tip` once rather than mounting a
 * Tooltip per field. */
export const FIELD_TIP_CLASS = 'optimizer-field-tip'

interface Props {
  label: string
  /** Shown from an info icon after the label. */
  tooltip?: string
  children: ReactNode
}

// A labelled control in the optimizer's assumptions column. Its own module
// because the section keeps one component per file, and the config panel uses
// eight of these.
function OptimizerFieldImpl({ label, tooltip, children }: Props) {
  return (
    <label className="flex flex-column gap-1">
      <span className="text-sm text-color-secondary">
        {label}
        {tooltip && (
          <i
            className={`pi pi-info-circle ml-1 text-xs ${FIELD_TIP_CLASS}`}
            data-pr-tooltip={tooltip}
          />
        )}
      </span>
      {children}
    </label>
  )
}

export const OptimizerField = memo(OptimizerFieldImpl)
