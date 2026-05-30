import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  name: string
  size?: number
  className?: string
  alt?: string
}

const CATEGORY_SUFFIXES: [string, string][] = [
  ['Item', 'items'],
  ['Skill', 'skills'],
  ['TalentGroup', 'talents'],
]

function getIconPath(name: string): string {
  for (const [suffix, dir] of CATEGORY_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return `/eco-icons/${dir}/${name}.png`
    }
  }
  return `/eco-icons/misc/${name}.png`
}

export function EcoIcon({ name, size = 24, className, alt = '' }: Props) {
  const { t } = useTranslation()
  // Track the *src* that failed, not a bare boolean. EcoIcon is reused with a
  // changing `name` (e.g. in autocomplete item templates / selected-value
  // slots where React keeps the same element instance), so a boolean would
  // stay stuck on the fallback after one icon 404s even when a later `name`
  // points at a valid image. Deriving `failed` from the current path resets it
  // automatically whenever `name` changes.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const path = getIconPath(name)
  const failed = failedSrc === path

  if (failed) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        role="img"
        aria-label={alt || t('common.missingIcon')}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }

  return (
    <img
      src={path}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setFailedSrc(path)}
    />
  )
}
