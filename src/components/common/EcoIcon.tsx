interface Props {
  name: string
  size?: number
  className?: string
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

export function EcoIcon({ name, size = 24, className }: Props) {
  return <img src={getIconPath(name)} alt="" width={size} height={size} className={className} />
}
