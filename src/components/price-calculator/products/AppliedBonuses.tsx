import { useTranslation } from 'react-i18next'

import { PluginModuleIcon } from '@/components/common/PluginModuleIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { TalentIcon } from '@/components/common/TalentIcon'
import { useLocalization } from '@/hooks/use-localization'
import type { AppliedBonus, AppliedEffect } from '@/lib/recipe-modifiers'

interface Props {
  bonuses: AppliedBonus[]
}

function BonusIconFor({ bonus }: { bonus: AppliedBonus }) {
  switch (bonus.icon.kind) {
    case 'skill':
      return <SkillIcon skill={{ name: bonus.icon.rawName }} size={20} />
    case 'talent':
      return <TalentIcon talent={{ talentGroupName: bonus.icon.talentGroupName }} size={20} />
    case 'module':
      return <PluginModuleIcon module={{ name: bonus.icon.rawName }} size={20} />
  }
}

export function AppliedBonuses({ bonuses }: Props) {
  const { t } = useTranslation()
  const { formatPercent } = useLocalization()

  if (bonuses.length === 0) return null

  const renderEffect = (e: AppliedEffect): string => {
    // `signedPercent` is already a percentage (-10 for a 10% reduction), so it
    // has to come back to a ratio for Intl's percent style.
    const percent = formatPercent(e.signedPercent / 100, {
      signDisplay: 'exceptZero',
      maximumFractionDigits: 1,
    })
    return t('priceCalculator.recipe.bonusEffect', {
      percent,
      metric: t(`priceCalculator.recipe.metric.${e.metric}`),
    })
  }

  return (
    <div>
      <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.bonusesApplied')}</h4>
      <ul className="list-none p-0 m-0 flex flex-column gap-2 ml-3">
        {bonuses.map((bonus, i) => (
          <li key={`${bonus.source}-${i}`} className="mb-2">
            <span className="flex align-items-center gap-2">
              <BonusIconFor bonus={bonus} />
              <span>{bonus.displayName}</span>
            </span>
            <ul>
              {bonus.effects.map((effect, i) => (
                <li key={i.toString()}>{renderEffect(effect)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
