/**
 * One-line catalog status. Stable line box (`min-height` on
 * `.market-page-status`) so copy swaps do not shove the section below.
 * Prefer settling the band with the hint (Market Yours/sales) over an
 * invisible reserved slot.
 */
export function CatalogStatusLine({ children }: { children: string }) {
  return <p className="market-page-status">{children}</p>;
}
