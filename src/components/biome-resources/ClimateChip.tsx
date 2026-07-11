interface Props {
  label?: string
  value: string
}

export function ClimateChip({ label, value }: Props) {
  return (
    <span
      className="text-xs px-2 py-1 border-round-3xl text-color-secondary"
      style={{ border: '1px solid var(--surface-border)' }}
    >
      {label && `${label} `}
      <b className="text-color">{value}</b>
    </span>
  )
}
