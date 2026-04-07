/**
 * Centralized section layout tokens.
 * Change values here to update spacing across all pages.
 */
export const section = {
  /** Vertical padding for content sections */
  py: 'py-16',
  /** Container: full-width, centered, max-w-6xl with horizontal padding */
  container: 'w-full mx-auto max-w-6xl px-4',
  /** Section heading: centered, uppercase, muted */
  heading:
    'mb-5 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground',
  /** Card grid */
  grid: 'grid gap-4 md:grid-cols-2',
  /** Card internal padding */
  card: 'px-5 py-6 lg:px-6 lg:py-8',
} as const;
