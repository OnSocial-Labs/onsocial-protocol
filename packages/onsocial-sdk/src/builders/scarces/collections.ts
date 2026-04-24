// ---------------------------------------------------------------------------
// Pure builders for collection-level scarces actions.
// ---------------------------------------------------------------------------

import type { CollectionOptions } from '../../types.js';
import { nearToYocto, parseOptionalU64 } from './_shared.js';

export function buildCreateCollectionAction(opts: CollectionOptions) {
  const metadataTemplate = JSON.stringify({
    title: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.extra ? { extra: JSON.stringify(opts.extra) } : {}),
  });

  return {
    type: 'create_collection' as const,
    collection_id: opts.collectionId,
    total_supply: opts.totalSupply,
    metadata_template: metadataTemplate,
    price_near: nearToYocto(opts.priceNear ?? '0'),
    ...(opts.royalty ? { royalty: opts.royalty } : {}),
    ...(opts.appId ? { app_id: opts.appId } : {}),
    ...(opts.mintMode ? { mint_mode: opts.mintMode } : {}),
    ...(opts.maxPerWallet != null ? { max_per_wallet: opts.maxPerWallet } : {}),
    ...(opts.renewable != null ? { renewable: opts.renewable } : {}),
    ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
    ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
    ...(parseOptionalU64(opts.startTime) != null
      ? { start_time: parseOptionalU64(opts.startTime) }
      : {}),
    ...(parseOptionalU64(opts.endTime) != null
      ? { end_time: parseOptionalU64(opts.endTime) }
      : {}),
  };
}

export function buildMintFromCollectionAction(
  collectionId: string,
  quantity = 1,
  receiverId?: string
) {
  return {
    type: 'mint_from_collection' as const,
    collection_id: collectionId,
    quantity,
    ...(receiverId ? { receiver_id: receiverId } : {}),
  };
}

export function buildPurchaseFromCollectionAction(
  collectionId: string,
  maxPricePerTokenNear: string,
  quantity = 1
) {
  return {
    type: 'purchase_from_collection' as const,
    collection_id: collectionId,
    quantity,
    max_price_per_token: nearToYocto(maxPricePerTokenNear),
  };
}

export function buildAirdropAction(collectionId: string, receivers: string[]) {
  return {
    type: 'airdrop_from_collection' as const,
    collection_id: collectionId,
    receivers,
  };
}

export function buildPauseCollectionAction(collectionId: string) {
  return {
    type: 'pause_collection' as const,
    collection_id: collectionId,
  };
}

export function buildResumeCollectionAction(collectionId: string) {
  return {
    type: 'resume_collection' as const,
    collection_id: collectionId,
  };
}

export function buildDeleteCollectionAction(collectionId: string) {
  return {
    type: 'delete_collection' as const,
    collection_id: collectionId,
  };
}
