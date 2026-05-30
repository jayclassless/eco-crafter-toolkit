interface Props {
  className?: string
  title?: string
}

// A seedling/sprout glyph drawn to match the PrimeIcons style: a single
// currentColor shape on a 0 0 24 24 grid, sized to 1em so it lines up with
// the `.pi` font icons used elsewhere (e.g. in the navbar tool switcher).
export function PlantIcon({ className, title }: Props) {
  return (
    <svg
      className={className}
      // Tightened around the artwork (drawn on a 0 0 24 24 grid, centered at
      // ~12,14.25) so the sprout fills the box and reads at the same visual
      // size as the neighbouring `.pi` font icons rather than appearing small.
      viewBox="2.77 5.02 18.46 18.46"
      width="1em"
      height="1em"
      fill="currentColor"
      style={{ display: 'inline-block', lineHeight: 1, verticalAlign: 'middle' }}
      aria-hidden
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M12 21.5c-.3-3.5-.3-6.5 0-9"
      />
      <path d="M12 13.2c-2.7-4-5.7-6-8.4-5.7-.3 0 0 3.4 2.4 5.3 2.2 1.7 4.6 1.4 6-.4 1.4 1.8 3.8 2.1 6 .4 2.4-1.9 2.7-5.3 2.4-5.3-2.7-.3-5.7 1.7-8.4 5.7z" />
    </svg>
  )
}
