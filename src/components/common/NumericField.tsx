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
  const [text, setText] = useState(() => formatNumber(value, maxFractionDigits))
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
    setText(formatNumber(value, maxFractionDigits))
  }, [value, maxFractionDigits])

  // Debounced commit driven by local text edits. Intermediate states
  // (".", "-", "-.") resolve to `undefined` and are deliberately not
  // committed, so the user can continue typing them into a full number.
  useEffect(() => {
    if (!isFocused.current) return
    const id = setTimeout(() => {
      const parsed = parseNumericText(text, { min, max, maxFractionDigits })
      if (parsed === undefined) return
      if (parsed === value) return
      onChangeRef.current(parsed)
    }, debounceMs)
    return () => clearTimeout(id)
    // `value` is intentionally excluded: committing a value triggers a
    // parent re-render which flows back as a new `value` prop, and we do
    // not want that to restart the debounce timer for the user's own edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, debounceMs, min, max, maxFractionDigits])

  // Commit a focused, in-progress edit if the field unmounts before blur.
  // Virtualized tables unmount rows that scroll out of the render window, so
  // without this a price typed moments before scrolling would be dropped
  // (the debounce effect's cleanup cancels the pending commit). Refs carry
  // the latest state because an unmount cleanup runs with the closure of the
  // final render.
  const commitStateRef = useRef({ text, value, min, max, maxFractionDigits })
  commitStateRef.current = { text, value, min, max, maxFractionDigits }
  useEffect(
    () => () => {
      if (!isFocused.current) return
      const s = commitStateRef.current
      const parsed = parseNumericText(s.text, {
        min: s.min,
        max: s.max,
        maxFractionDigits: s.maxFractionDigits,
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
    const parsed = parseNumericText(text, { min, max, maxFractionDigits })
    // Intermediate/invalid text on blur reverts to the last committed
    // value rather than committing a partial value.
    const committed = parsed === undefined ? value : parsed
    if (committed !== value) {
      onChangeRef.current(committed)
    }
    setText(formatNumber(committed, maxFractionDigits))
  }, [text, value, min, max, maxFractionDigits])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const allowNegative = (min ?? 0) < 0
      setText(sanitizeInputText(e.target.value, allowNegative))
    },
    [min]
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

function formatNumber(value: number | null, maxFractionDigits: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const factor = 10 ** maxFractionDigits
  const rounded = Math.round(value * factor) / factor
  return rounded.toString()
}

/**
 * Parses the user's in-progress text into a commit decision:
 *   - number   → commit this value (clamped & rounded)
 *   - null     → commit null (empty field)
 *   - undefined→ intermediate, do not commit (e.g. ".", "-", "-.")
 */
function parseNumericText(
  text: string,
  { min, max, maxFractionDigits }: { min?: number; max?: number; maxFractionDigits: number }
): number | null | undefined {
  const trimmed = text.trim()
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

function sanitizeInputText(text: string, allowNegative: boolean): string {
  let result = ''
  let sawDot = false
  let i = 0
  if (allowNegative && text[0] === '-') {
    result = '-'
    i = 1
  }
  for (; i < text.length; i++) {
    const c = text[i]
    if (c >= '0' && c <= '9') {
      result += c
    } else if (c === '.' && !sawDot) {
      result += c
      sawDot = true
    }
  }
  return result
}

export const NumericField = memo(NumericFieldImpl)
