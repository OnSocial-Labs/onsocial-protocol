/**
 * One spoken Collect / Buy deal — same voice as New drop (`25 editions · 1 NEAR`).
 * Price is the unit ask. Footer scales the commit total when qty > 1.
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
  if (
    remaining != null &&
    Number.isFinite(remaining) &&
    remaining < copies
  ) {
    return `${remaining} of ${copies} left`;
  }
  const unit = opts.unit.trim() || 'editions';
  return `${copies} ${unit}`;
}

export function scarceBuyDealParts(opts: {
  isPrimaryMint: boolean;
  copies?: number | null;
  remaining?: number | null;
  unit: string;
  priceNear?: string | null;
  listedLabel?: string | null;
  mintedLabel?: string | null;
}): string[] {
  const price = formatScarceBuyPrice(opts.priceNear);
  if (opts.isPrimaryMint) {
    const supply = scarceBuySupplyPart({
      copies: opts.copies,
      remaining: opts.remaining,
      unit: opts.unit,
    });
    return [supply, price].filter((part): part is string => Boolean(part));
  }
  const listed = opts.listedLabel?.trim() || '';
  const minted = opts.mintedLabel?.trim() || '';
  return [price, listed, minted].filter(Boolean);
}
