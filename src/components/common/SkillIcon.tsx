import { EcoIcon } from './EcoIcon'

interface Props {
  skill: { name: string }
  size?: number
  className?: string
  alt?: string
}

export function SkillIcon({ skill, size = 24, className, alt }: Props) {
  return <EcoIcon name={skill.name} size={size} className={className} alt={alt ?? skill.name} />
}
