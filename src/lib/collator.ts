/** A `sort` comparator over strings. */
export type Compare = (a: string, b: string) => number

const compareCache = new Map<string, Compare>()

/**
 * The display-order comparator for `locale`, for sorting anything a user
 * reads: item names, skill names, profession labels.
 *
 * Always prefer this over a bare `a.localeCompare(b)`, for two reasons:
 *
 *  1. **Correctness.** With no locale argument `localeCompare` collates by the
 *     _browser's_ locale, not the language the app is displaying, so Swedish
 *     `ö`, Danish `å` and Spanish `ñ` land in the wrong place relative to the
 *     names next to them.
 *  2. **Performance.** `localeCompare` re-resolves a collator on many engines,
 *     and these sorts run over thousands of rows on every rebuild. Resolving
 *     one `Intl.Collator` up front and reusing its bound `compare` is the
 *     documented fast path.
 *
 * `numeric: true` sorts embedded digit runs by value, so "Upgrade 2" precedes
 * "Upgrade 10". Today's datasets only carry single digits (Lv2, Lv3,
 * Upgrade 1-4), so it changes no current ordering — it is insurance for the
 * day a two-digit name appears.
 *
 * Components get this from `useLocalization().compare`; pure functions in
 * `lib/` take it as a parameter, the same way they already take `getName`.
 */
export function getCompare(locale: string): Compare {
  let compare = compareCache.get(locale)
  if (!compare) {
    compare = new Intl.Collator(locale, { numeric: true }).compare
    compareCache.set(locale, compare)
  }
  return compare
}

/**
 * Locale-independent ordering for internal keys — entity ids, raw (English,
 * unlocalized) family and kind names. Use it for tie-breakers whose only job
 * is a deterministic result.
 *
 * These deliberately do NOT follow the display locale: the value is never read
 * by the user, and making a stored map's iteration order depend on the UI
 * language would make results shift under a language switch.
 */
export const compareKeys: Compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
