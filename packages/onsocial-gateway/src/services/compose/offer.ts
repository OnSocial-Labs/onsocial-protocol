/**
 * Compose: Offers — make, cancel, and accept offers on tokens and collections.
 *
 * Supports both token-level offers (specific NFT) and collection-level offers
 * (any token within a collection). All payments are gasless via NEAR Intents.
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
  nearToYocto,
} from './shared.js';

// ---------------------------------------------------------------------------
// Token-level offers
// ---------------------------------------------------------------------------

/** Build a MakeOffer action — offer to buy a specific token. */
export function buildMakeOfferAction(params: {
  tokenId: string;
  amountNear: string;
  expiresAt?: number;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.amountNear) throw new ComposeError(400, 'Missing amountNear');
  return {
    action: {
      type: 'make_offer',
      token_id: params.tokenId,
      amount: nearToYocto(params.amountNear),
      ...(params.expiresAt != null && { expires_at: params.expiresAt }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a CancelOffer action — cancel your pending offer on a token. */
export function buildCancelOfferAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: { type: 'cancel_offer', token_id: params.tokenId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an AcceptOffer action — accept a buyer's offer on your token. */
export function buildAcceptOfferAction(params: {
  tokenId: string;
  buyerId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.buyerId) throw new ComposeError(400, 'Missing buyerId');
  return {
    action: {
      type: 'accept_offer',
      token_id: params.tokenId,
      buyer_id: params.buyerId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Collection-level offers
// ---------------------------------------------------------------------------

/** Build a MakeCollectionOffer action — offer to buy any token from a collection. */
export function buildMakeCollectionOfferAction(params: {
  collectionId: string;
  amountNear: string;
  expiresAt?: number;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.amountNear) throw new ComposeError(400, 'Missing amountNear');
  return {
    action: {
      type: 'make_collection_offer',
      collection_id: params.collectionId,
      amount: nearToYocto(params.amountNear),
      ...(params.expiresAt != null && { expires_at: params.expiresAt }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a CancelCollectionOffer action. */
export function buildCancelCollectionOfferAction(params: {
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'cancel_collection_offer',
      collection_id: params.collectionId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an AcceptCollectionOffer action — accept a buyer's collection offer, matching a specific token. */
export function buildAcceptCollectionOfferAction(params: {
  collectionId: string;
  tokenId: string;
  buyerId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.buyerId) throw new ComposeError(400, 'Missing buyerId');
  return {
    action: {
      type: 'accept_collection_offer',
      collection_id: params.collectionId,
      token_id: params.tokenId,
      buyer_id: params.buyerId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
