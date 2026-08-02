/**
 * Compose: Create Collection — create Scarces collections with auto-uploaded images.
 */

import { config } from '../../config/index.js';
import {
  type UploadedFile,
  type UploadResult,
  type VariationUploadResult,
  ComposeError,
  uploadToLighthouse,
  uploadVariationImagesToLighthouse,
  resolveExistingMediaCid,
  variationMediaUrl,
  verifyCidLive,
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
  /** Sale start time (unix ns — contract sale window) */
  startTime?: number;
  /** Sale end time (unix ns — contract sale window) */
  endTime?: number;
  /**
   * Absolute access end stamped into every minted token’s NEP-177 metadata
   * (`expires_at`, milliseconds since epoch). Same for all seats.
   */
  expiresAtMs?: number;
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
  /**
   * Variation set (BYO storage): IPFS directory CID whose files are named
   * `1.<ext>` … `<totalSupply>.<ext>`. Each minted token resolves its own
   * media via the `{seat_number}` placeholder. Mutually exclusive with
   * `mediaCid` / uploaded variation images.
   */
  variationsCid?: string;
  /** File extension inside the variations directory (default `png`). */
  variationsExt?: string;
  /**
   * Per-token trait metadata (BYO storage): IPFS directory CID whose files
   * are named `1.<ext>` … `<totalSupply>.<ext>` (OpenSea-style `attributes`
   * JSON). Templated into NEP-177 `reference` via `{seat_number}`.
   */
  referenceCid?: string;
  /** File extension inside the reference directory (default `json`). */
  referenceExt?: string;
  /**
   * Random seat assignment: each mint draws a uniformly random unminted
   * piece so rare variations cannot be sniped by timing a purchase.
   */
  randomAssignment?: boolean;
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
  /** Present when the drop is a variation set. */
  variations?: VariationUploadResult;
  /** Present when per-token trait metadata is attached. */
  reference?: { cid: string; ext: string; urlTemplate: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip per-token placeholders from a drop title for provenance display. */
function stripTitlePlaceholders(title: string): string {
  return title
    .replace(/\s*#\{seat_number\}/g, '')
    .replace(/\s*\{(seat_number|index|edition|token_id)\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Series pointer from the collection-level metadata blob (string or object). */
function parseSeriesPointer(
  metadata: unknown
): { id: string; title?: string } | null {
  let value: unknown = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).series;
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

// ---------------------------------------------------------------------------
// Build + Compose
// ---------------------------------------------------------------------------

/**
 * Build a CreateCollection action — uploads collection image to Lighthouse,
 * builds the metadata_template with the CID injected, and returns the action
 * object without relaying.
 *
 * Used by:
 *   - /compose/prepare/create-collection  → returns action for SDK NEP-366 signing
 */
export async function buildCreateCollectionAction(
  accountId: string,
  req: ComposeCreateCollectionRequest,
  imageFile?: UploadedFile,
  variationImageFiles?: UploadedFile[]
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

  if (req.expiresAtMs != null) {
    if (!Number.isFinite(req.expiresAtMs) || req.expiresAtMs <= Date.now()) {
      throw new ComposeError(400, 'Access end must be in the future');
    }
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

  const hasVariationUpload =
    variationImageFiles != null && variationImageFiles.length > 0;
  if (hasVariationUpload && (req.mediaCid || imageFile)) {
    throw new ComposeError(
      400,
      'Provide either a single cover image or a variation set, not both'
    );
  }
  if (hasVariationUpload && req.variationsCid) {
    throw new ComposeError(
      400,
      'Provide either uploaded variation images or variationsCid, not both'
    );
  }
  if (req.variationsCid && req.mediaCid) {
    throw new ComposeError(
      400,
      'variationsCid and mediaCid are mutually exclusive'
    );
  }

  let media: UploadResult | undefined;
  let variations: VariationUploadResult | undefined;

  // 1. Resolve media.
  if (hasVariationUpload) {
    // Variation set: every token gets its own art. Uploaded as one IPFS
    // directory so a single CID seals the full set before the first mint.
    if (variationImageFiles.length !== req.totalSupply) {
      throw new ComposeError(
        400,
        `Variation set must have exactly one image per token: got ${variationImageFiles.length} images for supply ${req.totalSupply}`
      );
    }
    variations = await uploadVariationImagesToLighthouse(variationImageFiles);
    logger.info(
      { accountId, cid: variations.cid, count: variations.count },
      'Compose create-collection: variation set uploaded'
    );
  } else if (req.variationsCid) {
    // BYO variation directory (large / generative sets pinned upstream).
    const ext = (req.variationsExt || 'png').replace(/^\./, '').toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) {
      throw new ComposeError(400, 'Invalid variationsExt');
    }
    // Spot-check the directory bounds so a broken/incomplete pin fails
    // here instead of minting tokens with dead media.
    await verifyCidLive(`${req.variationsCid}/1.${ext}`);
    if (req.totalSupply > 1) {
      await verifyCidLive(`${req.variationsCid}/${req.totalSupply}.${ext}`);
    }
    variations = {
      cid: req.variationsCid,
      count: req.totalSupply,
      ext,
      urlTemplate: variationMediaUrl(req.variationsCid, ext),
    };
  } else if (req.mediaCid) {
    media = await resolveExistingMediaCid(req.mediaCid, req.mediaHash);
  } else if (imageFile) {
    media = await uploadToLighthouse(imageFile);
    logger.info(
      { accountId, cid: media.cid, size: media.size },
      'Compose create-collection: image uploaded to Lighthouse'
    );
  }

  // 1b. Per-token trait metadata (marketplace-style attributes). Same
  // `{seat_number}` addressing as variation media, pinned as `1.json`… under
  // one directory CID. Content-addressed, so no per-token reference_hash.
  let reference: CreateCollectionActionResult['reference'];
  if (req.referenceCid) {
    const ext = (req.referenceExt || 'json').replace(/^\./, '').toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) {
      throw new ComposeError(400, 'Invalid referenceExt');
    }
    await verifyCidLive(`${req.referenceCid}/1.${ext}`);
    if (req.totalSupply > 1) {
      await verifyCidLive(`${req.referenceCid}/${req.totalSupply}.${ext}`);
    }
    reference = {
      cid: req.referenceCid,
      ext,
      urlTemplate: variationMediaUrl(req.referenceCid, ext),
    };
  }

  // Random assignment only makes sense when tokens differ from each other.
  if (req.randomAssignment && !variations && !reference) {
    throw new ComposeError(
      400,
      'randomAssignment requires a variation set or per-token reference metadata'
    );
  }

  // 2. Build NEP-177 metadata template (this is what each minted token gets)
  // We store the dedicated-gateway https URL on-chain (not `ipfs://...`)
  // so wallets render reliably without depending on the public IPFS DHT.
  //
  // Variation sets: `media` keeps the `{seat_number}` placeholder — the
  // contract interpolates the token's global mint position. No `media_hash`
  // (per-token media, content-addressed by the directory CID) and
  // `copies: 1` (each artwork is unique).
  // Every variation token needs a distinct title — append the seat number
  // unless the caller already templated one in.
  const hasTitlePlaceholder = /\{(seat_number|index|token_id)\}/.test(
    req.title
  );
  const templateTitle =
    variations && !hasTitlePlaceholder
      ? `${req.title} #{seat_number}`
      : req.title;

  // Token provenance — stamped into every minted token's NEP-177 `extra` so
  // wallets, explorers, and marketplaces can attribute the token to its
  // drop / series / creator without calling contract views. Authoritative
  // fields (collection, creator) override caller-supplied keys; the series
  // pointer mirrors the collection-level metadata blob.
  const series = parseSeriesPointer(req.metadata);
  const extra: Record<string, unknown> = {
    ...(req.extra ?? {}),
    collection: {
      id: req.collectionId,
      title: stripTitlePlaceholders(req.title) || req.collectionId,
    },
    ...(series ? { series } : {}),
    creator: accountId,
  };

  const metadataTemplate: Record<string, unknown> = {
    title: templateTitle,
    ...(req.description && { description: req.description }),
    ...(variations && { media: variations.urlTemplate, copies: 1 }),
    ...(!variations && media && { media: media.url }),
    ...(!variations && media && media.hash && { media_hash: media.hash }),
    ...(reference && { reference: reference.urlTemplate }),
    ...(req.expiresAtMs != null && { expires_at: req.expiresAtMs }),
    extra: JSON.stringify(extra),
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
    ...(req.randomAssignment && { random_assignment: true }),
  };

  // 4. Resolve target account
  const targetAccount =
    req.targetAccount ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet');

  return {
    action,
    targetAccount,
    media,
    ...(variations && { variations }),
    ...(reference && { reference }),
  };
}
