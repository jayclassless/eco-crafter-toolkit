import { EcoIcon } from './EcoIcon'

interface Props {
  module: { name: string }
  size?: number
  className?: string
  alt?: string
}

export function PluginModuleIcon({ module, size = 20, className, alt }: Props) {
  return <EcoIcon name={module.name} size={size} className={className} alt={alt ?? module.name} />
}
