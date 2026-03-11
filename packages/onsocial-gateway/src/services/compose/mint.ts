/**
 * Compose: Mint — mint NFTs with auto-uploaded media + metadata.
 */

import { config } from '../../config/index.js';
import {
  type UploadedFile,
  type UploadResult,
  ComposeError,
  uploadToLighthouse,
  uploadJsonToLighthouse,
  intentAuth,
  relayExecute,
  extractTxHash,
  logger,
  validateRoyalty,
  MAX_METADATA_LEN,
} from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeMintRequest {
  title: string;
  description?: string;
  /** Optional: additional metadata fields (NEP-177 `extra` — stringified JSON) */
  extra?: Record<string, unknown>;
  /** Number of copies (default 1) */
  copies?: number;
  /** Collection ID for collection-based minting (uses MintFromCollection) */
  collectionId?: string;
  /** Quantity to mint from collection (default 1, only for MintFromCollection) */
  quantity?: number;
  /** Receiver for collection mint (defaults to caller) */
  receiverId?: string;
  /** Royalty map: { "account.near": 2500 } = 25% (only for QuickMint) */
  royalty?: Record<string, number>;
  /** App ID for analytics attribution (only for QuickMint) */
  appId?: string;
  /** Optional: override target account (which scarces contract) */
  targetAccount?: string;
  /** Existing IPFS CID to reuse (skips file upload — e.g. post image already on IPFS) */
  mediaCid?: string;
  /** Base64 SHA-256 hash of the media (pairs with mediaCid for NEP-177 media_hash) */
  mediaHash?: string;
}

export interface ComposeMintResult {
  txHash: string;
  media?: UploadResult;
  metadata?: UploadResult;
}

/** Prepared Mint action ready for signing (returned by prepare endpoints). */
export interface MintActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
  media?: UploadResult;
  metadata?: UploadResult;
}

// ---------------------------------------------------------------------------
// Build + Compose
// ---------------------------------------------------------------------------

/**
 * Build a Mint action — uploads media/metadata to Lighthouse, returns
 * the action object without relaying.
 *
 * Used by:
 *   - composeMint()           → intent auth (server/API-key callers)
 *   - /compose/prepare/mint   → returns action for SDK signing (signed_payload)
 */
export async function buildMintAction(
  accountId: string,
  req: ComposeMintRequest,
  imageFile?: UploadedFile
): Promise<MintActionResult> {
  let media: UploadResult | undefined;

  // ── Validate ──────────────────────────────────────────────────────
  if (req.collectionId) {
    // MintFromCollection: quantity must be 1-10
    const qty = req.quantity ?? 1;
    if (qty < 1 || qty > 10) {
      throw new ComposeError(400, 'Quantity must be 1-10');
    }
  } else {
    // QuickMint: validate royalty
    const royaltyError = validateRoyalty(req.royalty);
    if (royaltyError) throw new ComposeError(400, royaltyError);
  }

  // 1. Resolve media: reuse existing CID or upload new file
  if (!req.collectionId) {
    if (req.mediaCid) {
      // Reuse existing IPFS CID (e.g. post image already uploaded via /compose/set)
      media = {
        cid: req.mediaCid,
        size: 0,
        url: `https://gateway.lighthouse.storage/ipfs/${req.mediaCid}`,
        hash: req.mediaHash || '',
      };
      logger.info(
        { accountId, cid: media.cid },
        'Compose mint: reusing existing media CID'
      );
    } else if (imageFile) {
      media = await uploadToLighthouse(imageFile);
      logger.info(
        { accountId, cid: media.cid, size: media.size },
        'Compose mint: image uploaded to Lighthouse'
      );
    }
  }

  // 2. Build action
  let action: Record<string, unknown>;
  let metadata: UploadResult | undefined;

  if (req.collectionId) {
    // ── MintFromCollection ──────────────────────────────────────────
    // Collection already has metadata/price configured. Caller only
    // specifies collection_id, quantity, and optional receiver_id.
    action = {
      type: 'mint_from_collection',
      collection_id: req.collectionId,
      quantity: req.quantity ?? 1,
      ...(req.receiverId && { receiver_id: req.receiverId }),
    };
  } else {
    // ── QuickMint ──────────────────────────────────────────────────
    // Build NEP-177 metadata for a standalone (non-collection) mint.
    const tokenMetadata: Record<string, unknown> = {
      title: req.title,
      ...(req.description && { description: req.description }),
      ...(media && { media: `ipfs://${media.cid}` }),
      ...(media && { media_hash: media.hash }),
      ...(req.copies && { copies: req.copies }),
      ...(req.extra && { extra: JSON.stringify(req.extra) }),
    };

    // 3. Upload full metadata JSON to Lighthouse (OpenSea-compatible)
    const fullMetadata = {
      ...tokenMetadata,
      ...(media && { image: `ipfs://${media.cid}` }),
      name: req.title,
      ...(req.description && { description: req.description }),
      ...(req.extra || {}),
    };

    metadata = await uploadJsonToLighthouse(fullMetadata);
    tokenMetadata.reference = `ipfs://${metadata.cid}`;
    tokenMetadata.reference_hash = metadata.hash;

    // ScarceOptions fields are #[serde(flatten)]'d — they go at root level
    action = {
      type: 'quick_mint',
      metadata: tokenMetadata,
      ...(req.royalty && { royalty: req.royalty }),
      ...(req.appId && { app_id: req.appId }),
    };

    // Validate serialised metadata size (contract limit MAX_METADATA_LEN = 16 KB)
    const metadataBytes = Buffer.byteLength(
      JSON.stringify(tokenMetadata),
      'utf-8'
    );
    if (metadataBytes > MAX_METADATA_LEN) {
      throw new ComposeError(
        400,
        `Metadata exceeds max length of ${MAX_METADATA_LEN} bytes (got ${metadataBytes} bytes)`
      );
    }
  }

  // 4. Resolve target account
  const targetAccount =
    req.targetAccount ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet');

  return { action, targetAccount, media, metadata };
}

/**
 * Compose: Mint — uploads media/metadata, builds action, relays via intent auth.
 * For signed-payload flow, use buildMintAction() + /relay/signed instead.
 */
export async function composeMint(
  accountId: string,
  req: ComposeMintRequest,
  imageFile?: UploadedFile
): Promise<ComposeMintResult> {
  const built = await buildMintAction(accountId, req, imageFile);
  const relay = await relayExecute(
    intentAuth(accountId),
    built.action,
    built.targetAccount
  );
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  return {
    txHash: extractTxHash(relay.data),
    media: built.media,
    metadata: built.metadata,
  };
}
