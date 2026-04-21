interface Props {
  title?: string
}

export function PartLabel({ title }: Props) {
  return (
    <span className="text-color-secondary text-sm flex align-items-center gap-1" title={title}>
      <i className="pi pi-cog text-xs" />
      Part
    </span>
  )
}
