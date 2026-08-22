import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { SkillIcon } from '@/components/common/SkillIcon'

interface Props {
  skillNames: string[]
  skillRawNames: string[]
}

// The skill(s) that craft an item. Zero is common and legitimate — flowers are
// picked, trophies are awarded — so the empty case renders an em-dash rather
// than being filtered out. Glass is the multi-skill case (Glassworking and
// Recycling both produce it).
function SkillCellImpl({ skillNames, skillRawNames }: Props) {
  const { t } = useTranslation()
  if (skillNames.length === 0) {
    return <span className="text-color-secondary">{t('housingScore.noSkill')}</span>
  }
  return (
    <div className="flex align-items-center gap-2 flex-wrap">
      {skillNames.map((name, i) => (
        <span key={name} className="flex align-items-center gap-1">
          {skillRawNames[i] && <SkillIcon skill={{ name: skillRawNames[i] }} />}
          <span>{name}</span>
        </span>
      ))}
    </div>
  )
}

export const SkillCell = memo(SkillCellImpl)
