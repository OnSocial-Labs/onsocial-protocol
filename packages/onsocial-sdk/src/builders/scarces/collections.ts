// ---------------------------------------------------------------------------
// Pure builders for collection-level scarces actions.
// ---------------------------------------------------------------------------

import type { CollectionOptions } from '../../types.js';
import {
  buildTokenMetadata,
  nearToYocto,
  parseOptionalU64,
} from './_shared.js';

/** Strip per-token placeholders from a drop title for provenance display. */
function stripTitlePlaceholders(title: string): string {
  return title
    .replace(/\s*#\{seat_number\}/g, '')
    .replace(/\s*\{(seat_number|index|edition|token_id)\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Series pointer from the collection-level metadata blob, when present. */
function seriesPointer(
  metadata: Record<string, unknown> | undefined
): { id: string; title?: string } | null {
  const raw = metadata?.series;
  if (typeof raw === 'string' && raw.trim()) return { id: raw.trim() };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : undefined;
  return { id, ...(title ? { title } : {}) };
}

/**
 * Stamp immutable provenance into the token template `extra` — collection
 * id/title, series pointer, and creator — so any wallet, explorer, or
 * marketplace can attribute a minted token to its drop without calling
 * contract views. Provenance fields override caller-supplied keys of the
 * same name; everything else in `extra` passes through.
 */
export function withCollectionProvenance(
  opts: CollectionOptions,
  creator?: string | null
): CollectionOptions {
  const series = seriesPointer(opts.metadata);
  return {
    ...opts,
    extra: {
      ...(opts.extra ?? {}),
      collection: {
        id: opts.collectionId,
        title: stripTitlePlaceholders(opts.title) || opts.collectionId,
      },
      ...(series ? { series } : {}),
      ...(creator ? { creator } : {}),
    },
  };
}

/** Contract cap (`MAX_METADATA_LEN`) for `metadata_template` / `metadata`. */
export const MAX_COLLECTION_METADATA_BYTES = 16_384;

function byteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

function assertMetadataSize(json: string, label: string): void {
  const bytes = byteLength(json);
  if (bytes > MAX_COLLECTION_METADATA_BYTES) {
    throw new Error(
      `Drop ${label} is too large (${bytes.toLocaleString()} bytes; max ` +
        `${MAX_COLLECTION_METADATA_BYTES.toLocaleString()}). Trim the ` +
        'description, lyrics, or track list and try again.'
    );
  }
}

export function buildCreateCollectionAction(opts: CollectionOptions) {
  const metadataTemplate = JSON.stringify(
    buildTokenMetadata({
      title: opts.title,
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.mediaCid ? { mediaCid: opts.mediaCid } : {}),
      ...(opts.mediaHash ? { mediaHash: opts.mediaHash } : {}),
      ...(opts.expiresAtMs != null ? { expiresAtMs: opts.expiresAtMs } : {}),
      ...(opts.extra ? { extra: opts.extra } : {}),
    })
  );
  // Preflight the on-chain cap so oversized drops fail before the wallet
  // opens (the contract rejects with the same limit).
  assertMetadataSize(metadataTemplate, 'metadata');
  const collectionMetadata = opts.metadata
    ? JSON.stringify(opts.metadata)
    : null;
  if (collectionMetadata) {
    assertMetadataSize(collectionMetadata, 'collection metadata');
  }

  return {
    type: 'create_collection' as const,
    collection_id: opts.collectionId,
    total_supply: opts.totalSupply,
    metadata_template: metadataTemplate,
    price_near: nearToYocto(opts.priceNear ?? '0'),
    ...(opts.royalty ? { royalty: opts.royalty } : {}),
    ...(collectionMetadata ? { metadata: collectionMetadata } : {}),
    ...(opts.appId ? { app_id: opts.appId } : {}),
    ...(opts.mintMode ? { mint_mode: opts.mintMode } : {}),
    ...(opts.maxPerWallet != null ? { max_per_wallet: opts.maxPerWallet } : {}),
    ...(opts.maxPerPurchase != null
      ? { max_per_purchase: opts.maxPerPurchase }
      : {}),
    ...(opts.randomAssignment ? { random_assignment: true } : {}),
    ...(opts.renewable != null ? { renewable: opts.renewable } : {}),
    ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
    ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
    ...(opts.maxRedeems != null ? { max_redeems: opts.maxRedeems } : {}),
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
