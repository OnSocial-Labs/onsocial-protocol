/**
 * Quiet facts under the price. The price itself is its own line.
 * Primary mint keeps supply (`25 editions`). A resale keeps one clock
 * (`Listed 2d ago`). Minted stays in the facts sheet.
 */

export function formatScarceBuyPrice(
  priceNear: string | null | undefined
): string {
  if (!priceNear?.trim()) return '';
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

export function scarceBuySupplyPart(opts: {
  copies?: number | null;
  remaining?: number | null;
  unit: string;
}): string | null {
  const copies = opts.copies;
  if (copies == null || !Number.isFinite(copies) || copies <= 1) return null;
  const remaining = opts.remaining;
  if (remaining != null && Number.isFinite(remaining) && remaining < copies) {
    return `${remaining} of ${copies} left`;
  }
  const unit = opts.unit.trim() || 'editions';
  return `${copies} ${unit}`;
}

/**
 * Spoken ask for the price line. Dollars win when the sticker is set.
 * A zero NEAR ask stays blank so a dollar sticker can arrive without
 * flashing `0 NEAR`.
 */
export function scarceBuyPriceLine(opts: {
  priceLabel?: string | null;
  priceNear?: string | null;
}): string {
  const dollars = opts.priceLabel?.trim() || '';
  if (dollars) return dollars;
  const near = formatScarceBuyPrice(opts.priceNear);
  if (!near || near === '0 NEAR') return '';
  return near;
}

export function scarceBuyDealParts(opts: {
  isPrimaryMint: boolean;
  copies?: number | null;
  remaining?: number | null;
  unit?: string;
  listedLabel?: string | null;
}): string[] {
  if (opts.isPrimaryMint) {
    const supply = scarceBuySupplyPart({
      copies: opts.copies,
      remaining: opts.remaining,
      unit: opts.unit ?? 'editions',
    });
    return supply ? [supply] : [];
  }
  const listed = opts.listedLabel?.trim() || '';
  return listed ? [listed] : [];
}
