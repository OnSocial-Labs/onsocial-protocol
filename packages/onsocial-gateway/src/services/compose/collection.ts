/**
 * Compose: Create Collection — create Scarces collections with auto-uploaded images.
 */

import { config } from '../../config/index.js';
import {
  type UploadedFile,
  type UploadResult,
  ComposeError,
  uploadToLighthouse,
  intentAuth,
  relayExecute,
  extractTxHash,
  logger,
  validateRoyalty,
  MAX_METADATA_LEN,
  MAX_COLLECTION_SUPPLY,
  nearToYocto,
} from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeCreateCollectionRequest {
  /** Unique collection ID (1-64 chars, no ':', '.', or null) */
  collectionId: string;
  /** Total supply of tokens in the collection */
  totalSupply: number;
  /** Token title template (can use {edition} placeholder) */
  title: string;
  /** Token description */
  description?: string;
  /** Price per mint in NEAR (as string, e.g. "1.5"). Defaults to "0" for free collections. */
  priceNear?: string;
  /** Optional: additional metadata fields (NEP-177 `extra`) */
  extra?: Record<string, unknown>;
  /** Sale start time (unix ms) */
  startTime?: number;
  /** Sale end time (unix ms) */
  endTime?: number;
  /** Royalty map: { "account.near": 2500 } = 25% */
  royalty?: Record<string, number>;
  /** App ID for analytics attribution */
  appId?: string;
  /** Allow renewable tokens */
  renewable?: boolean;
  /** Max redeems per token */
  maxRedeems?: number;
  /** Mint mode: "open" | "purchase_only" | "creator_only" */
  mintMode?: string;
  /** Max tokens per wallet */
  maxPerWallet?: number;
  /** Collection-level metadata (JSON string or object) */
  metadata?: string;
  /** Starting price for dutch auction (NEAR as string) */
  startPrice?: string;
  /** Allowlist price override (NEAR as string) */
  allowlistPrice?: string;
  /** Is token transferable (default true) */
  transferable?: boolean;
  /** Is token burnable (default true) */
  burnable?: boolean;
  /** Pre-uploaded IPFS CID — when set, gateway skips upload (BYO storage). */
  mediaCid?: string;
  /** Pre-computed media hash to pair with `mediaCid`. */
  mediaHash?: string;
  /** Optional: override target account (which scarces contract) */
  targetAccount?: string;
}

export interface ComposeCreateCollectionResult {
  txHash: string;
  media?: UploadResult;
  /** Present when relayer was called with wait=true. */
  success?: boolean;
  status?: string;
  error?: string;
}

/** Prepared CreateCollection action ready for signing. */
export interface CreateCollectionActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
  media?: UploadResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Build + Compose
// ---------------------------------------------------------------------------

/**
 * Build a CreateCollection action — uploads collection image to Lighthouse,
 * builds the metadata_template with the CID injected, and returns the action
 * object without relaying.
 *
 * Used by:
 *   - composeCreateCollection()           → intent auth (server/API-key callers)
 *   - /compose/prepare/create-collection  → returns action for SDK signing
 */
export async function buildCreateCollectionAction(
  accountId: string,
  req: ComposeCreateCollectionRequest,
  imageFile?: UploadedFile
): Promise<CreateCollectionActionResult> {
  // ── Validate (mirrors contracts/scarces-onsocial/src/collections/create.rs) ──

  // Collection ID
  if (!req.collectionId || req.collectionId.length > 64) {
    throw new ComposeError(400, 'Collection ID must be 1-64 characters');
  }
  if (/[:\0.]/.test(req.collectionId)) {
    throw new ComposeError(
      400,
      "Collection ID cannot contain ':', '.', or null characters"
    );
  }
  if (req.collectionId === 's' || req.collectionId === 'll') {
    throw new ComposeError(400, "Collection ID 's' and 'll' are reserved");
  }

  // Total supply: 1 – MAX_COLLECTION_SUPPLY (contract uses u32, max 100 000)
  if (
    !req.totalSupply ||
    req.totalSupply < 1 ||
    req.totalSupply > MAX_COLLECTION_SUPPLY
  ) {
    throw new ComposeError(
      400,
      `Total supply must be 1-${MAX_COLLECTION_SUPPLY}`
    );
  }

  // priceNear — optional; defaults to "0" for free collections
  const priceNear = req.priceNear || '0';

  // Time window
  if (
    req.startTime != null &&
    req.endTime != null &&
    req.endTime <= req.startTime
  ) {
    throw new ComposeError(400, 'End time must be after start time');
  }

  // Royalty
  const royaltyError = validateRoyalty(req.royalty);
  if (royaltyError) throw new ComposeError(400, royaltyError);

  // max_per_wallet
  if (req.maxPerWallet != null && req.maxPerWallet < 1) {
    throw new ComposeError(400, 'max_per_wallet must be > 0');
  }

  // Dutch auction
  if (req.startPrice) {
    // startPrice must exceed priceNear (floor)
    // Compare as bigint after conversion
    const spYocto = BigInt(nearToYocto(req.startPrice));
    const pnYocto = BigInt(nearToYocto(priceNear));
    if (spYocto <= pnYocto) {
      throw new ComposeError(
        400,
        'start_price must be greater than price_near (floor) for Dutch auction'
      );
    }
    if (req.startTime == null || req.endTime == null) {
      throw new ComposeError(
        400,
        'Dutch auction requires both start_time and end_time'
      );
    }
  }

  // Allowlist price
  if (req.allowlistPrice) {
    if (req.startTime == null) {
      throw new ComposeError(
        400,
        'allowlist_price requires start_time (WL phase = before start_time)'
      );
    }
    const alpYocto = BigInt(nearToYocto(req.allowlistPrice));
    const pnYocto = BigInt(nearToYocto(priceNear));
    if (alpYocto === 0n && pnYocto !== 0n) {
      throw new ComposeError(
        400,
        'allowlist_price must be > 0 unless collection is free'
      );
    }
  }

  let media: UploadResult | undefined;

  // 1. Resolve media: prefer caller-provided CID (BYO storage); else upload.
  if (req.mediaCid) {
    media = {
      cid: req.mediaCid,
      url: `${config.lighthouseGatewayBase.replace(/\/+$/, '')}/${req.mediaCid}`,
      size: 0,
      hash: req.mediaHash ?? '',
    };
  } else if (imageFile) {
    media = await uploadToLighthouse(imageFile);
    logger.info(
      { accountId, cid: media.cid, size: media.size },
      'Compose create-collection: image uploaded to Lighthouse'
    );
  }

  // 2. Build NEP-177 metadata template (this is what each minted token gets)
  // We store the dedicated-gateway https URL on-chain (not `ipfs://...`)
  // so wallets render reliably without depending on the public IPFS DHT.
  const metadataTemplate: Record<string, unknown> = {
    title: req.title,
    ...(req.description && { description: req.description }),
    ...(media && { media: media.url }),
    ...(media && media.hash && { media_hash: media.hash }),
    ...(req.extra && { extra: JSON.stringify(req.extra) }),
  };

  // Validate serialised template size (contract limit MAX_METADATA_LEN = 16 KB)
  const templateJson = JSON.stringify(metadataTemplate);
  if (Buffer.byteLength(templateJson, 'utf-8') > MAX_METADATA_LEN) {
    throw new ComposeError(
      400,
      `Metadata template exceeds max length of ${MAX_METADATA_LEN}`
    );
  }

  // 3. Build the CreateCollection action (#[serde(flatten)] params: CollectionConfig)
  const action: Record<string, unknown> = {
    type: 'create_collection',
    collection_id: req.collectionId,
    total_supply: req.totalSupply,
    metadata_template: templateJson,
    price_near: nearToYocto(priceNear),
    ...(req.startTime != null && { start_time: req.startTime }),
    ...(req.endTime != null && { end_time: req.endTime }),
    ...(req.royalty && { royalty: req.royalty }),
    ...(req.appId && { app_id: req.appId }),
    ...(req.renewable != null && { renewable: req.renewable }),
    ...(req.maxRedeems != null && { max_redeems: req.maxRedeems }),
    ...(req.mintMode && { mint_mode: req.mintMode }),
    ...(req.maxPerWallet != null && { max_per_wallet: req.maxPerWallet }),
    ...(req.metadata != null && { metadata: req.metadata }),
    ...(req.startPrice && { start_price: nearToYocto(req.startPrice) }),
    ...(req.allowlistPrice && {
      allowlist_price: nearToYocto(req.allowlistPrice),
    }),
    ...(req.transferable != null && { transferable: req.transferable }),
    ...(req.burnable != null && { burnable: req.burnable }),
  };

  // 4. Resolve target account
  const targetAccount =
    req.targetAccount ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet');

  return { action, targetAccount, media };
}

/**
 * Compose: Create Collection — uploads image, builds action, relays via intent auth.
 * For signed-payload flow, use buildCreateCollectionAction() + /relay/signed instead.
 */
export async function composeCreateCollection(
  accountId: string,
  req: ComposeCreateCollectionRequest,
  imageFile?: UploadedFile,
  opts: { wait?: boolean } = {}
): Promise<ComposeCreateCollectionResult> {
  const built = await buildCreateCollectionAction(accountId, req, imageFile);
  const relay = await relayExecute(
    intentAuth(accountId),
    built.action,
    built.targetAccount,
    { wait: opts.wait }
  );
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  const data =
    typeof relay.data === 'object' && relay.data !== null
      ? (relay.data as Record<string, unknown>)
      : {};
  return {
    txHash: extractTxHash(relay.data),
    media: built.media,
    ...('success' in data && { success: data.success as boolean }),
    ...('status' in data && { status: data.status as string }),
    ...('error' in data && { error: data.error as string }),
  };
}
