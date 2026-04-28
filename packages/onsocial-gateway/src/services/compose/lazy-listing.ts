/**
 * Compose: Lazy Listing — list content for sale without minting upfront.
 *
 * The token is minted directly to the buyer on purchase (mint-on-demand).
 * Perfect for social commerce: post in core → list → buyer pays → mint to buyer.
 */

import { config } from '../../config/index.js';
import {
  type UploadedFile,
  type UploadResult,
  ComposeError,
  uploadToLighthouse,
  uploadJsonToLighthouse,
  inlineSvgAsDataUri,
  intentAuth,
  relayExecute,
  extractTxHash,
  logger,
  validateRoyalty,
  nearToYocto,
  MAX_METADATA_LEN,
} from './shared.js';
import {
  generateTextCardSvg,
  resolveTheme,
  isBackgroundKey,
  isFontKey,
  type BackgroundKey,
  type FontKey,
} from '@onsocial/text-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeLazyListRequest {
  /** Title for the listing metadata */
  title: string;
  /** Description */
  description?: string;
  /** Fixed price in NEAR (e.g. "5") */
  priceNear: string;
  /** Optional: additional metadata fields (NEP-177 `extra`) */
  extra?: Record<string, unknown>;
  /** Existing IPFS CID to reuse (e.g. post image already on IPFS) */
  mediaCid?: string;
  /** Base64 SHA-256 hash of the media (pairs with mediaCid) */
  mediaHash?: string;
  /** Royalty map: { "account.near": 2500 } = 25% */
  royalty?: Record<string, number>;
  /** App ID for analytics attribution */
  appId?: string;
  /** Is token transferable after purchase (default true) */
  transferable?: boolean;
  /** Is token burnable (default true) */
  burnable?: boolean;
  /** Listing expiry (unix timestamp nanoseconds) */
  expiresAt?: number;
  /** Optional: override target account (which scarces contract) */
  targetAccount?: string;
  /**
   * Skip the auto-generated branded text-card image when no media is
   * supplied. Default: false (auto-card is generated and inlined so
   * wallets render an actual image instead of an empty placeholder).
   */
  skipAutoMedia?: boolean;
  /**
   * Optional creator profile rendered onto the auto-generated text card.
   * When omitted, the calling accountId is used so attribution is
   * always preserved.
   */
  creator?: {
    accountId: string;
    displayName?: string;
  };
  /** Auto-card theming. Unknown keys fall back to defaults. */
  cardBg?: BackgroundKey | string;
  cardFont?: FontKey | string;
}

export interface ComposeLazyListResult {
  txHash: string;
  media?: UploadResult;
  metadata?: UploadResult;
  /** Present when relayer was called with wait=true. */
  success?: boolean;
  status?: string;
  error?: string;
}

/** Prepared LazyListing action ready for signing. */
export interface LazyListActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
  media?: UploadResult;
  metadata?: UploadResult;
}

/** Prepared simple action (cancel / update / purchase) for signing. */
export interface LazyListingSimpleResult {
  action: Record<string, unknown>;
  targetAccount: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTarget(override?: string): string {
  return (
    override ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet')
  );
}

// ---------------------------------------------------------------------------
// Build: Create Lazy Listing
// ---------------------------------------------------------------------------

/**
 * Build a CreateLazyListing action — uploads media/metadata to Lighthouse,
 * returns the action object without relaying.
 *
 * Used by:
 *   - composeLazyList()            → intent auth (server/API-key callers)
 *   - /compose/prepare/lazy-list   → returns action for SDK signing
 */
export async function buildLazyListAction(
  accountId: string,
  req: ComposeLazyListRequest,
  imageFile?: UploadedFile
): Promise<LazyListActionResult> {
  // ── Validate ──────────────────────────────────────────────────────
  if (!req.priceNear) {
    throw new ComposeError(400, 'Price is required (priceNear)');
  }

  const royaltyError = validateRoyalty(req.royalty);
  if (royaltyError) throw new ComposeError(400, royaltyError);

  // ── Resolve media ─────────────────────────────────────────────────
  let media: UploadResult | undefined;

  if (req.mediaCid) {
    media = {
      cid: req.mediaCid,
      size: 0,
      url: `${config.lighthouseGatewayBase.replace(/\/+$/, '')}/${req.mediaCid}`,
      hash: req.mediaHash || '',
    };
    logger.info(
      { accountId, cid: media.cid },
      'Compose lazy-list: reusing existing media CID'
    );
  } else if (imageFile) {
    media = await uploadToLighthouse(imageFile);
    logger.info(
      { accountId, cid: media.cid, size: media.size },
      'Compose lazy-list: image uploaded to Lighthouse'
    );
  } else if (!req.skipAutoMedia) {
    // No image and no reused CID — generate a typographic text-card SVG
    // and inline it as a data: URI. Mirrors composeMint so themed cards
    // are first-class on every release path.
    const creator = req.creator ?? { accountId };
    if (req.cardBg && !isBackgroundKey(req.cardBg)) {
      throw new ComposeError(400, `Unknown cardBg: ${req.cardBg}`);
    }
    if (req.cardFont && !isFontKey(req.cardFont)) {
      throw new ComposeError(400, `Unknown cardFont: ${req.cardFont}`);
    }
    const theme = resolveTheme({ bg: req.cardBg, font: req.cardFont });
    const svg = generateTextCardSvg({
      title: req.title,
      description: req.description,
      creator,
      theme,
    });
    media = inlineSvgAsDataUri(svg);
    req.extra = {
      ...(req.extra || {}),
      theme: { bg: theme.bg, font: theme.font },
    };
    logger.info(
      { accountId, size: media.size, theme },
      'Compose lazy-list: auto-generated text card inlined as data: URI'
    );
  }

  // ── Build NEP-177 metadata ────────────────────────────────────────
  // Store the dedicated-gateway https URL on-chain (not `ipfs://...`) so
  // wallets render reliably without depending on the public IPFS DHT.
  const tokenMetadata: Record<string, unknown> = {
    title: req.title,
    ...(req.description && { description: req.description }),
    ...(media && { media: media.url }),
    ...(media?.hash && { media_hash: media.hash }),
    ...(req.extra && { extra: JSON.stringify(req.extra) }),
  };

  // Upload full metadata JSON to Lighthouse
  const fullMetadata = {
    ...tokenMetadata,
    ...(media && { image: media.url }),
    name: req.title,
    ...(req.description && { description: req.description }),
    ...(req.extra || {}),
  };

  const metadata = await uploadJsonToLighthouse(fullMetadata);
  tokenMetadata.reference = metadata.url;
  tokenMetadata.reference_hash = metadata.hash;

  // Validate serialised metadata size
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

  // ── Build action ──────────────────────────────────────────────────
  // CreateLazyListing uses #[serde(flatten)] for ScarceOptions
  const action: Record<string, unknown> = {
    type: 'create_lazy_listing',
    metadata: tokenMetadata,
    price: nearToYocto(req.priceNear),
    ...(req.royalty && { royalty: req.royalty }),
    ...(req.appId && { app_id: req.appId }),
    ...(req.transferable != null && { transferable: req.transferable }),
    ...(req.burnable != null && { burnable: req.burnable }),
    ...(req.expiresAt != null && { expires_at: req.expiresAt }),
  };

  return {
    action,
    targetAccount: resolveTarget(req.targetAccount),
    media,
    metadata,
  };
}

/**
 * Compose: Create Lazy Listing — uploads media/metadata, builds action, relays.
 */
export async function composeLazyList(
  accountId: string,
  req: ComposeLazyListRequest,
  imageFile?: UploadedFile,
  opts: { wait?: boolean } = {}
): Promise<ComposeLazyListResult> {
  const built = await buildLazyListAction(accountId, req, imageFile);
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
    metadata: built.metadata,
    ...('success' in data && { success: data.success as boolean }),
    ...('status' in data && { status: data.status as string }),
    ...('error' in data && { error: data.error as string }),
  };
}

// ---------------------------------------------------------------------------
// Build: Cancel / Update / Purchase
// ---------------------------------------------------------------------------

/** Build a CancelLazyListing action. */
export function buildCancelLazyListingAction(
  listingId: string,
  targetAccount?: string
): LazyListingSimpleResult {
  if (!listingId) throw new ComposeError(400, 'Missing listingId');
  return {
    action: { type: 'cancel_lazy_listing', listing_id: listingId },
    targetAccount: resolveTarget(targetAccount),
  };
}

/** Build an UpdateLazyListingPrice action. */
export function buildUpdateLazyListingPriceAction(
  listingId: string,
  newPriceNear: string,
  targetAccount?: string
): LazyListingSimpleResult {
  if (!listingId) throw new ComposeError(400, 'Missing listingId');
  if (!newPriceNear) throw new ComposeError(400, 'Missing newPriceNear');
  return {
    action: {
      type: 'update_lazy_listing_price',
      listing_id: listingId,
      new_price: nearToYocto(newPriceNear),
    },
    targetAccount: resolveTarget(targetAccount),
  };
}

/** Build an UpdateLazyListingExpiry action. */
export function buildUpdateLazyListingExpiryAction(
  listingId: string,
  newExpiresAt: number | null,
  targetAccount?: string
): LazyListingSimpleResult {
  if (!listingId) throw new ComposeError(400, 'Missing listingId');
  return {
    action: {
      type: 'update_lazy_listing_expiry',
      listing_id: listingId,
      new_expires_at: newExpiresAt,
    },
    targetAccount: resolveTarget(targetAccount),
  };
}

/** Build a PurchaseLazyListing action. */
export function buildPurchaseLazyListingAction(
  listingId: string,
  targetAccount?: string
): LazyListingSimpleResult {
  if (!listingId) throw new ComposeError(400, 'Missing listingId');
  return {
    action: { type: 'purchase_lazy_listing', listing_id: listingId },
    targetAccount: resolveTarget(targetAccount),
  };
}
