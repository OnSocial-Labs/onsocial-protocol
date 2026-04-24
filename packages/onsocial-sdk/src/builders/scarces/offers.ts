// ---------------------------------------------------------------------------
// Pure builders for offer actions (token-level + collection-level).
// ---------------------------------------------------------------------------

import type { CollectionOfferOptions, OfferOptions } from '../../types.js';
import { nearToYocto, parseOptionalU64 } from './_shared.js';

export function buildMakeOfferAction(opts: OfferOptions) {
  return {
    type: 'make_offer' as const,
    token_id: opts.tokenId,
    amount: nearToYocto(opts.amountNear),
    ...(parseOptionalU64(opts.expiresAt) != null
      ? { expires_at: parseOptionalU64(opts.expiresAt) }
      : {}),
  };
}

export function buildCancelOfferAction(tokenId: string) {
  return {
    type: 'cancel_offer' as const,
    token_id: tokenId,
  };
}

export function buildAcceptOfferAction(tokenId: string, buyerId: string) {
  return {
    type: 'accept_offer' as const,
    token_id: tokenId,
    buyer_id: buyerId,
  };
}

export function buildMakeCollectionOfferAction(opts: CollectionOfferOptions) {
  return {
    type: 'make_collection_offer' as const,
    collection_id: opts.collectionId,
    amount: nearToYocto(opts.amountNear),
    ...(parseOptionalU64(opts.expiresAt) != null
      ? { expires_at: parseOptionalU64(opts.expiresAt) }
      : {}),
  };
}

export function buildCancelCollectionOfferAction(collectionId: string) {
  return {
    type: 'cancel_collection_offer' as const,
    collection_id: collectionId,
  };
}

export function buildAcceptCollectionOfferAction(
  collectionId: string,
  tokenId: string,
  buyerId: string
) {
  return {
    type: 'accept_collection_offer' as const,
    collection_id: collectionId,
    token_id: tokenId,
    buyer_id: buyerId,
  };
}
