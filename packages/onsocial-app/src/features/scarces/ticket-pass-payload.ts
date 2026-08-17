/**
 * Compact Show-pass QR payload.
 * Door scan prefers live `os2|…` (signed); legacy `os1:` and bare token
 * ids still parse for collection/token identity.
 *
 * Legacy: `os1:{collectionId}:{tokenId}`
 * Live:   `os2|{collection}|{token}|{exp}|{pk}|{nonce}|{sig}`
 */
export const TICKET_PASS_PAYLOAD_PREFIX = 'os1';

export interface TicketPassPayload {
  collectionId: string;
  tokenId: string;
}

/** True for ticket / membership / coupon drops that use redeem check-ins. */
export function isPassMediumKind(
  mediumKind: string | null | undefined
): boolean {
  const key = (mediumKind ?? '').trim().toLowerCase();
  return key === 'ticket' || key === 'membership' || key === 'coupon';
}

/**
 * Staff redeem voice — tickets/memberships use Door Admit;
 * coupons use a Redeem counter page.
 */
export type PassStaffVoice = 'admit' | 'redeem';

export function passStaffVoice(
  mediumKind: string | null | undefined
): PassStaffVoice {
  const key = (mediumKind ?? '').trim().toLowerCase();
  return key === 'coupon' ? 'redeem' : 'admit';
}

export function isCouponMediumKind(
  mediumKind: string | null | undefined
): boolean {
  return (mediumKind ?? '').trim().toLowerCase() === 'coupon';
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
 * Accepts live `os2|…`, legacy `os1:…`, or a bare `{collection}:{edition}` token id.
 */
export function parseTicketPassPayload(
  raw: string,
  expectedCollectionId?: string | null
): TicketPassPayload | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('os2|')) {
    const parts = value.split('|');
    if (parts.length < 3) return null;
    const collectionId = (parts[1] ?? '').trim();
    const tokenId = (parts[2] ?? '').trim();
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

/** Guest-facing seat line — hide the collection:id eng form. */
export function ticketPassSeatLabel(tokenId: string): string {
  const id = tokenId.trim();
  if (!id) return 'Pass';
  const seat = id.includes(':') ? id.slice(id.lastIndexOf(':') + 1).trim() : '';
  if (/^\d+$/.test(seat)) return `Pass ${seat}`;
  return id;
}

/**
 * Quiet door cue when the current owner is not the original minter
 * (gift / transfer / secondary).
 */
export function ticketPassOriginLabel(opts: {
  ownerId: string;
  minterId: string;
}): string | null {
  const owner = opts.ownerId.trim();
  const minter = opts.minterId.trim();
  if (!owner || !minter) return null;
  if (owner.toLowerCase() === minter.toLowerCase()) return null;
  return 'Received';
}

/** Remaining check-ins before the pass is fully redeemed. */
export function ticketPassRemaining(opts: {
  redeemCount: number;
  maxRedeems: number | null | undefined;
}): number | null {
  if (opts.maxRedeems == null || opts.maxRedeems <= 0) return null;
  return Math.max(
    0,
    Math.floor(opts.maxRedeems) - Math.floor(opts.redeemCount)
  );
}

/** One-line status for Show pass / Door / Redeem preview. */
export function ticketPassStatusLabel(opts: {
  isValid: boolean;
  isFullyRedeemed: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  isRefunded?: boolean;
  redeemCount: number;
  maxRedeems: number | null | undefined;
  /** Coupon staff surface uses redeem wording. */
  voice?: PassStaffVoice;
}): string {
  const redeemVoice = opts.voice === 'redeem';
  const fullyDone = redeemVoice ? 'Fully redeemed' : 'Fully checked in';
  const unitOne = redeemVoice ? '1 redeem left' : '1 check-in left';
  const unitMany = (n: number) =>
    redeemVoice ? `${n} redeems left` : `${n} check-ins left`;

  if (opts.isRefunded) return 'Refunded';
  if (opts.isRevoked) return 'Revoked';
  if (opts.isExpired) return 'Expired';
  if (opts.isFullyRedeemed) return fullyDone;
  const remaining = ticketPassRemaining(opts);
  if (remaining == null) {
    return opts.isValid ? 'Valid' : 'Unavailable';
  }
  if (remaining === 0) return fullyDone;
  if (opts.redeemCount <= 0) {
    return remaining === 1 ? unitOne : unitMany(remaining);
  }
  return remaining === 1
    ? `${unitOne} · used ${opts.redeemCount}`
    : `${unitMany(remaining)} · used ${opts.redeemCount}`;
}
