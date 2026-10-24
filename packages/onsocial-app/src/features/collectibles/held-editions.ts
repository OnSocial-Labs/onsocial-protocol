import { editionSeatFromTokenId } from '@/features/market/market-listings';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

/** Sheet title. Send when the row will transfer. Editions when the row opens. */
export function heldEditionSheetTitle(choose: 'open' | 'send'): string {
  return choose === 'send' ? 'Send' : 'Editions';
}

/** `Edition 4`. A token without a seat stays unlabeled — never the raw id. */
export function heldEditionLabel(tokenId: string): string {
  const seat = editionSeatFromTokenId(tokenId);
  return seat != null ? `Edition ${seat}` : 'Edition';
}

/**
 * True when owned editions resolve to more than one image.
 * A shared cover (or no art) stays unlabeled in the picker.
 */
export function heldEditionCoversDiffer(
  editions: readonly { mediaUrl?: string | null }[]
): boolean {
  const urls = new Set<string>();
  for (const edition of editions) {
    const url = edition.mediaUrl?.trim();
    if (!url) continue;
    urls.add(url);
    if (urls.size > 1) return true;
  }
  return false;
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
