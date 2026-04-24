import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  placeholder?: string
  className?: string
  debounceMs?: number
  onDebouncedChange: (value: string) => void
}

/**
 * Self-contained debounced search input. Keeps the `value` state local so
 * keystrokes don't re-render the parent (and its heavy DataTable children).
 * Parent is only notified after `debounceMs` of quiet.
 */
function DebouncedSearchInputImpl({
  placeholder,
  className,
  debounceMs = 200,
  onDebouncedChange,
}: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const onChangeRef = useRef(onDebouncedChange)
  onChangeRef.current = onDebouncedChange

  useEffect(() => {
    const id = setTimeout(() => onChangeRef.current(value), debounceMs)
    return () => clearTimeout(id)
  }, [value, debounceMs])

  // IconField uses Children.map + cloneElement on every child, so a
  // conditional child that evaluates to `false`/`''` crashes the render.
  // Always render the clear icon and toggle visibility instead.
  const hasValue = value.length > 0
  return (
    <IconField iconPosition="right" className={className}>
      <InputText
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full"
      />
      <InputIcon
        className="pi pi-times"
        onClick={hasValue ? () => setValue('') : undefined}
        role={hasValue ? 'button' : undefined}
        aria-label={hasValue ? t('common.clearSearch') : undefined}
        style={{
          visibility: hasValue ? 'visible' : 'hidden',
          cursor: hasValue ? 'pointer' : 'default',
        }}
      />
    </IconField>
  )
}

export const DebouncedSearchInput = memo(DebouncedSearchInputImpl)
