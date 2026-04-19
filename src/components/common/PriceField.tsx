import { NumericField } from '@/components/common/NumericField'

interface Props {
  value: number | null
  onChange?: (value: number | null) => void
  readOnly?: boolean
  isCalculated?: boolean
  isOverride?: boolean
  placeholder?: string
}

export function PriceField({
  value,
  onChange,
  readOnly = false,
  isCalculated = false,
  isOverride = false,
  placeholder,
}: Props) {
  return (
    <div className="flex align-items-center gap-1">
      <NumericField
        value={value}
        onChange={(v) => onChange?.(v)}
        disabled={readOnly}
        min={0}
        maxFractionDigits={2}
        placeholder={placeholder}
        className="w-full text-right"
      />
      {isCalculated && <i className="pi pi-calculator text-xs text-color-secondary" />}
      {isOverride && <i className="pi pi-chevron-left text-xs text-color-secondary" />}
    </div>
  )
}
