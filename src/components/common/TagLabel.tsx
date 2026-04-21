interface Props {
  tagName: string
  title?: string
}

export function TagLabel({ tagName, title }: Props) {
  return (
    <span className="text-color-secondary text-sm flex align-items-center gap-1" title={title}>
      <i className="pi pi-tag text-xs" />
      {tagName}
    </span>
  )
}
