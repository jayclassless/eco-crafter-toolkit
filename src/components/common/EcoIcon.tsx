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
      return `/assets/eco-icons/${dir}/${name}.png`
    }
  }
  return `/assets/eco-icons/misc/${name}.png`
}

export function EcoIcon({ name, size = 24, className, alt = '' }: Props) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

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
      src={getIconPath(name)}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
