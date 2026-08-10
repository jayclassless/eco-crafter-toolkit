import { InputText } from 'primereact/inputtext'
import {
  type ChangeEvent,
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useLocalization } from '@/hooks/use-localization'

interface Props {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  maxFractionDigits?: number
  /** Rendered as a PrimeReact input-group addon to the right of the input. */
  suffix?: string
  placeholder?: string
  disabled?: boolean
  /** Milliseconds of quiet typing before a commit fires. Default 250. */
  debounceMs?: number
  /** Applied to the <InputText/> element. */
  className?: string
  /** Applied to the <InputText/> element. */
  style?: CSSProperties
  /**
   * Applied to the wrapping container. Only used when `suffix` is set; a
   * bare input has no wrapper to avoid changing layout vs. a raw InputText.
   */
  containerClassName?: string
  containerStyle?: CSSProperties
}

/**
 * Text-based numeric input that lets the user freely type partial values
 * like ".3", "1.", or "-" without premature reformatting, and commits the
 * parsed number to the parent on a debounce while typing. Commits
 * immediately on blur and re-formats the visible text to a canonical form.
 *
 * Built on InputText rather than PrimeReact's InputNumber because
 * InputNumber drops a leading dot (".3" → "3") and only exposes committed
 * changes on blur, neither of which matches the desired UX here.
 *
 * The decimal separator is the active locale's, so the field always accepts
 * back exactly what it displays (a pt-BR user sees and types `1,5`). Every
 * other non-digit is dropped, which discards grouping separators on paste —
 * `1.234,5` in pt-BR reads as 1234.5, and `1,234.5` in en-US as 1234.5.
 *
 * Note that this is deliberately narrower than `formatPrice`: grouping
 * separators are never *emitted*, because inserting them as the user types
 * fights with the caret.
 */
function NumericFieldImpl({
  value,
  onChange,
  min,
  max,
  maxFractionDigits = 2,
  suffix,
  placeholder,
  disabled,
  debounceMs = 250,
  className,
  style,
  containerClassName,
  containerStyle,
}: Props) {
  const { decimalSeparator } = useLocalization()
  const [text, setText] = useState(() => formatNumber(value, maxFractionDigits, decimalSeparator))
  const isFocused = useRef(false)

  // Stable handle to the latest onChange so the debounce effect doesn't
  // restart every render when the parent passes a fresh callback.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Sync external value → local text, but only when the input is NOT
  // focused. While the user is typing, they own the text state; a
  // concurrent parent re-render (e.g. from the value we just committed)
  // must not overwrite what they are in the middle of entering.
  useEffect(() => {
    if (isFocused.current) return
    setText(formatNumber(value, maxFractionDigits, decimalSeparator))
  }, [value, maxFractionDigits, decimalSeparator])

  // Debounced commit driven by local text edits. Intermediate states
  // (".", "-", "-.") resolve to `undefined` and are deliberately not
  // committed, so the user can continue typing them into a full number.
  useEffect(() => {
    if (!isFocused.current) return
    const id = setTimeout(() => {
      const parsed = parseNumericText(text, { min, max, maxFractionDigits, decimalSeparator })
      if (parsed === undefined) return
      if (parsed === value) return
      onChangeRef.current(parsed)
    }, debounceMs)
    return () => clearTimeout(id)
    // `value` is intentionally excluded: committing a value triggers a
    // parent re-render which flows back as a new `value` prop, and we do
    // not want that to restart the debounce timer for the user's own edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, debounceMs, min, max, maxFractionDigits, decimalSeparator])

  // Commit a focused, in-progress edit if the field unmounts before blur.
  // Virtualized tables unmount rows that scroll out of the render window, so
  // without this a price typed moments before scrolling would be dropped
  // (the debounce effect's cleanup cancels the pending commit). Refs carry
  // the latest state because an unmount cleanup runs with the closure of the
  // final render.
  const commitStateRef = useRef({ text, value, min, max, maxFractionDigits, decimalSeparator })
  commitStateRef.current = { text, value, min, max, maxFractionDigits, decimalSeparator }
  useEffect(
    () => () => {
      if (!isFocused.current) return
      const s = commitStateRef.current
      const parsed = parseNumericText(s.text, {
        min: s.min,
        max: s.max,
        maxFractionDigits: s.maxFractionDigits,
        decimalSeparator: s.decimalSeparator,
      })
      if (parsed === undefined || parsed === s.value) return
      onChangeRef.current(parsed)
    },
    []
  )

  const handleFocus = useCallback(() => {
    isFocused.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isFocused.current = false
    const parsed = parseNumericText(text, { min, max, maxFractionDigits, decimalSeparator })
    // Intermediate/invalid text on blur reverts to the last committed
    // value rather than committing a partial value.
    const committed = parsed === undefined ? value : parsed
    if (committed !== value) {
      onChangeRef.current(committed)
    }
    setText(formatNumber(committed, maxFractionDigits, decimalSeparator))
  }, [text, value, min, max, maxFractionDigits, decimalSeparator])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const allowNegative = (min ?? 0) < 0
      setText(sanitizeInputText(e.target.value, allowNegative, decimalSeparator))
    },
    [min, decimalSeparator]
  )

  const input = (
    <InputText
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
      inputMode="decimal"
    />
  )

  if (suffix !== undefined) {
    return (
      <div className={`p-inputgroup ${containerClassName ?? ''}`} style={containerStyle}>
        {input}
        <span className="p-inputgroup-addon">{suffix}</span>
      </div>
    )
  }

  return input
}

/** Ungrouped display text for a committed value, in the locale's separator. */
function formatNumber(
  value: number | null,
  maxFractionDigits: number,
  decimalSeparator: string
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const factor = 10 ** maxFractionDigits
  const rounded = Math.round(value * factor) / factor
  const text = rounded.toString()
  // `toString` always emits '.', so this is the only substitution needed.
  return decimalSeparator === '.' ? text : text.replace('.', decimalSeparator)
}

/** Rewrites displayed text into the '.'-separated form `Number()` accepts. */
function toCanonical(text: string, decimalSeparator: string): string {
  // `replace` with a string pattern is literal, so a regex-special separator
  // (none exist in CLDR today, but the guarantee is free) is safe here.
  return decimalSeparator === '.' ? text : text.replace(decimalSeparator, '.')
}

/**
 * Parses the user's in-progress text into a commit decision:
 *   - number   → commit this value (clamped & rounded)
 *   - null     → commit null (empty field)
 *   - undefined→ intermediate, do not commit (e.g. ".", "-", "-.")
 */
function parseNumericText(
  text: string,
  {
    min,
    max,
    maxFractionDigits,
    decimalSeparator,
  }: { min?: number; max?: number; maxFractionDigits: number; decimalSeparator: string }
): number | null | undefined {
  const trimmed = toCanonical(text.trim(), decimalSeparator)
  if (trimmed === '') return null
  if (trimmed === '-' || trimmed === '.' || trimmed === '-.') return undefined
  if (!/^-?\d*\.?\d*$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return undefined
  let clamped = n
  if (min !== undefined && clamped < min) clamped = min
  if (max !== undefined && clamped > max) clamped = max
  const factor = 10 ** maxFractionDigits
  return Math.round(clamped * factor) / factor
}

/**
 * Keeps digits, an optional leading sign, and at most one decimal separator.
 * Everything else is dropped — including grouping separators, so pasting a
 * formatted number yields its unformatted equivalent rather than garbage.
 */
function sanitizeInputText(text: string, allowNegative: boolean, decimalSeparator: string): string {
  let result = ''
  let sawSeparator = false
  let i = 0
  if (allowNegative && text[0] === '-') {
    result = '-'
    i = 1
  }
  for (; i < text.length; i++) {
    const c = text[i]
    if (c >= '0' && c <= '9') {
      result += c
    } else if (c === decimalSeparator && !sawSeparator) {
      result += c
      sawSeparator = true
    }
  }
  return result
}

export const NumericField = memo(NumericFieldImpl)
