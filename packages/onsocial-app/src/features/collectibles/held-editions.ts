import { editionSeatFromTokenId } from '@/features/market/market-listings';

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

export function compareHeldEditionTokenIds(a: string, b: string): number {
  const seatA = editionSeatFromTokenId(a);
  const seatB = editionSeatFromTokenId(b);
  if (seatA != null && seatB != null && seatA !== seatB) return seatA - seatB;
  if (seatA != null && seatB == null) return -1;
  if (seatA == null && seatB != null) return 1;
  return a.localeCompare(b);
}
