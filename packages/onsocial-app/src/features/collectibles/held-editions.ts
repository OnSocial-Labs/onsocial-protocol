import { editionSeatFromTokenId } from '@/features/market/market-listings';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import {
  isCouponMediumKind,
  isPassMediumKind,
} from '@/features/scarces/ticket-pass-payload';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

/** Sheet title. Send when the row will transfer. Editions when the row opens. */
export function heldEditionSheetTitle(choose: 'open' | 'send'): string {
  return choose === 'send' ? 'Send' : 'Editions';
}

/** Pass and Coupon match the pass. Every other kind stays Edition. */
export function heldEditionNoun(mediumKind?: string | null): string {
  if (isCouponMediumKind(mediumKind)) return 'Coupon';
  if (isPassMediumKind(mediumKind)) return 'Pass';
  return 'Edition';
}

/** `#41` — the seat, under a title that is already on screen. */
export function heldEditionMark(tokenId: string): string | null {
  const seat = editionSeatFromTokenId(tokenId);
  return seat != null ? `#${seat}` : null;
}

/**
 * Hash under a collectibles title. Several copies of one drop stay a count,
 * so the row does not pretend one seat is the holding.
 */
export function heldEditionRowMark(
  tokenId: string,
  editionCount: number
): string | null {
  if (editionCount !== 1) return null;
  return heldEditionMark(tokenId);
}

/** `Edition #4`, `Pass #2`, or `Coupon #3`. The copy when its title is not already shown. */
export function heldEditionLabel(
  tokenId: string,
  mediumKind?: string | null
): string {
  const noun = heldEditionNoun(mediumKind);
  const mark = heldEditionMark(tokenId);
  return mark ? `${noun} ${mark}` : noun;
}

/**
 * Toast once this copy's seat is known.
 * Pass and Coupon name themselves. Every other kind stays the hash.
 * Null when there is no seat, so the caller keeps the generic line.
 */
export function heldCopySuccessLine(
  tokenId: string | null | undefined,
  mediumKind: string | null | undefined,
  action: 'minted' | 'collected' | 'sent',
  recipient?: string | null
): string | null {
  const id = tokenId?.trim() ?? '';
  const mark = id ? heldEditionMark(id) : null;
  if (!mark) return null;
  const noun = heldEditionNoun(mediumKind);
  const named = noun === 'Pass' || noun === 'Coupon';
  if (action === 'minted') {
    return named ? `Minted ${noun} ${mark}.` : `Minted ${mark}.`;
  }
  if (action === 'sent') {
    const who = recipient?.trim();
    if (!who) return null;
    return named
      ? `Sent ${noun} ${mark} to ${who}.`
      : `Sent ${mark} to ${who}.`;
  }
  return named ? `${noun} ${mark} collected.` : `Collected ${mark}.`;
}

/**
 * True when a trail time would not read the same on every row.
 * Compare the labels a person sees, so two epoch stamps that both
 * read the same date stay off the row.
 */
export function heldEditionTrailTimesDiffer(
  labels: readonly (string | null | undefined)[]
): boolean {
  const present = labels.map((label) => label?.trim() || '').filter(Boolean);
  if (present.length === 0) return false;
  if (new Set(present).size > 1) return true;
  return present.length < labels.length;
}

export interface HeldEditionFact {
  label: string;
  value: string;
}

/** Facts for this copy: id, mint date, and a sale line when it is listed. */
export function heldEditionFactRows(item: {
  tokenId: string;
  mintedAtMs?: number | null;
  listingKind?: 'fixed' | 'auction' | null;
  listedPriceNear?: string | null;
  listedUsdE6?: string | null;
}): HeldEditionFact[] {
  const rows: HeldEditionFact[] = [];
  const tokenId = item.tokenId.trim();
  if (tokenId) rows.push({ label: 'Token', value: tokenId });
  const minted = item.mintedAtMs
    ? formatPageDrawerJoinedFullLabel(item.mintedAtMs)
    : null;
  if (minted) rows.push({ label: 'Minted', value: minted });
  if (item.listingKind) {
    const near = item.listedPriceNear?.trim();
    const dollars = near ? null : dollarStickerLabel(item.listedUsdE6);
    rows.push({
      label: 'Listed',
      value: near ? `${near} NEAR` : (dollars ?? 'For sale'),
    });
  }
  return rows;
}

export function compareHeldEditionTokenIds(a: string, b: string): number {
  const seatA = editionSeatFromTokenId(a);
  const seatB = editionSeatFromTokenId(b);
  if (seatA != null && seatB != null && seatA !== seatB) return seatA - seatB;
  if (seatA != null && seatB == null) return -1;
  if (seatA == null && seatB != null) return 1;
  return a.localeCompare(b);
}
