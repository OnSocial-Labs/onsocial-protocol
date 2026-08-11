/**
 * Compact Show-pass QR payload.
 * Door scan parses this; manual entry can still paste a raw token id.
 *
 * Format: `os1:{collectionId}:{tokenId}`
 */
export const TICKET_PASS_PAYLOAD_PREFIX = 'os1';

export interface TicketPassPayload {
  collectionId: string;
  tokenId: string;
}

/** True for ticket / membership / coupon drops that use redeem check-ins. */
export function isPassMediumKind(mediumKind: string | null | undefined): boolean {
  const key = (mediumKind ?? '').trim().toLowerCase();
  return key === 'ticket' || key === 'membership' || key === 'coupon';
}

export function encodeTicketPassPayload(
  collectionId: string,
  tokenId: string
): string | null {
  const collection = collectionId.trim();
  const token = tokenId.trim();
  if (!collection || !token) return null;
  if (collection.includes(':') || token.includes('\n')) return null;
  return `${TICKET_PASS_PAYLOAD_PREFIX}:${collection}:${token}`;
}

/**
 * Parse a scanned QR / pasted string into collection + token.
 * Accepts `os1:…` payloads or a bare `{collection}:{edition}` token id.
 */
export function parseTicketPassPayload(
  raw: string,
  expectedCollectionId?: string | null
): TicketPassPayload | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith(`${TICKET_PASS_PAYLOAD_PREFIX}:`)) {
    const rest = value.slice(TICKET_PASS_PAYLOAD_PREFIX.length + 1);
    const sep = rest.indexOf(':');
    if (sep <= 0 || sep >= rest.length - 1) return null;
    const collectionId = rest.slice(0, sep).trim();
    const tokenId = rest.slice(sep + 1).trim();
    if (!collectionId || !tokenId) return null;
    if (
      expectedCollectionId?.trim() &&
      collectionId !== expectedCollectionId.trim()
    ) {
      return null;
    }
    if (!tokenId.startsWith(`${collectionId}:`)) return null;
    return { collectionId, tokenId };
  }

  // Bare token id — infer collection from `{collection}:{edition}`.
  const sep = value.indexOf(':');
  if (sep <= 0 || sep >= value.length - 1) return null;
  if (value.startsWith('s:')) return null;
  const collectionId = value.slice(0, sep).trim();
  const tokenId = value.trim();
  if (!collectionId || !tokenId) return null;
  if (
    expectedCollectionId?.trim() &&
    collectionId !== expectedCollectionId.trim()
  ) {
    return null;
  }
  return { collectionId, tokenId };
}

/** Remaining check-ins before the pass is fully redeemed. */
export function ticketPassRemaining(opts: {
  redeemCount: number;
  maxRedeems: number | null | undefined;
}): number | null {
  if (opts.maxRedeems == null || opts.maxRedeems <= 0) return null;
  return Math.max(0, Math.floor(opts.maxRedeems) - Math.floor(opts.redeemCount));
}

/** One-line status for Show pass / Door preview. */
export function ticketPassStatusLabel(opts: {
  isValid: boolean;
  isFullyRedeemed: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  redeemCount: number;
  maxRedeems: number | null | undefined;
}): string {
  if (opts.isRevoked) return 'Revoked';
  if (opts.isExpired) return 'Expired';
  if (opts.isFullyRedeemed) return 'Fully checked in';
  const remaining = ticketPassRemaining(opts);
  if (remaining == null) {
    return opts.isValid ? 'Valid' : 'Unavailable';
  }
  if (remaining === 0) return 'Fully checked in';
  if (opts.redeemCount <= 0) {
    return remaining === 1 ? '1 check-in left' : `${remaining} check-ins left`;
  }
  return remaining === 1
    ? `1 check-in left · used ${opts.redeemCount}`
    : `${remaining} check-ins left · used ${opts.redeemCount}`;
}
