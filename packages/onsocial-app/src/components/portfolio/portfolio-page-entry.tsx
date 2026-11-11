'use client';

/**
 * Keyboard leave into the portfolio page drawer.
 * Pointer users swipe up on the grip — this control stays invisible until
 * :focus-visible, then paints the same “Swipe up” line.
 */
export function PortfolioPageContentEntry({
  open,
  concealed,
  onOpen,
}: {
  open: boolean;
  /** Hidden from keyboard and the accessibility tree while the sheet trap is up. */
  concealed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="portfolio-page-entry"
      aria-label="Open page"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-hidden={concealed ? true : undefined}
      tabIndex={concealed ? -1 : undefined}
      onClick={onOpen}
    >
      <span className="portfolio-page-entry-label" aria-hidden>
        Swipe up
      </span>
    </button>
  );
}
