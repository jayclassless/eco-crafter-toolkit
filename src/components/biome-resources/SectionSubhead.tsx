interface Props {
  label: string
}

// Small uppercase section label with a hairline extending to the right,
// used inside the Below-the-Surface and Flora & Fauna panels.
export function SectionSubhead({ label }: Props) {
  return (
    <div className="flex align-items-center gap-2 mt-3 mb-2">
      <span
        className="text-xs uppercase font-semibold text-color-secondary"
        style={{ letterSpacing: '0.1em' }}
      >
        {label}
      </span>
      <div className="flex-1" style={{ height: '1px', background: 'var(--surface-border)' }} />
    </div>
  )
}
