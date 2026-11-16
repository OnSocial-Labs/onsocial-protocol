/**
 * One-line catalog status. Always occupies the line box so a late message
 * does not shove the section below (Yours, sales, vault).
 */
export function CatalogStatusLine({
  children,
  reserved = false,
}: {
  children?: string | null;
  /** Hold the line height with no visible copy while the hint is undecided. */
  reserved?: boolean;
}) {
  if (!children && !reserved) return null;
  return (
    <p
      className={`market-page-status${reserved && !children ? ' is-reserved' : ''}`}
      aria-hidden={reserved && !children ? true : undefined}
    >
      {children || '\u00a0'}
    </p>
  );
}
