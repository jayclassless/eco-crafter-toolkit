import { EcoIcon } from './EcoIcon'

interface Props {
  talent: { talentGroupName: string }
  size?: number
  className?: string
  alt?: string
}

export function TalentIcon({ talent, size = 20, className, alt }: Props) {
  return (
    <EcoIcon
      name={talent.talentGroupName}
      size={size}
      className={className}
      alt={alt ?? talent.talentGroupName}
    />
  )
}
