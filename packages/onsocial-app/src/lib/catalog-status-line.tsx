/**
 * One-line catalog status. Stable line box (`min-height` on
 * `.market-page-status`). Use `reserved` only while a hint is undecided
 * above an already-painted band — never delay that band to wait on it.
 */
export function CatalogStatusLine({
  children,
  reserved = false,
}: {
  children?: string | null;
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
