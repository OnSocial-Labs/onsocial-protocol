/**
 * One bar on the gesture line while the row is still unknown.
 * The whole row replaces it together — visitor verbs, or the owner's marks.
 */
export function GestureSlotHold({
  bare = false,
  label,
}: {
  /** Already inside `.portfolio-identity-gestures`. */
  bare?: boolean;
  /** Announces the wait. Decorative when omitted. */
  label?: string;
}) {
  const row = (
    <div
      className="portfolio-identity-gesture-row portfolio-identity-gesture-row--loading"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="portfolio-identity-gesture-shimmer" />
    </div>
  );
  if (bare) return row;
  return (
    <div className="portfolio-identity-gestures" aria-busy="true">
      {row}
    </div>
  );
}
