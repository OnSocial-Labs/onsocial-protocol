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
  fetchImageAsDataUri,
  resolveExistingMediaCid,
  logger,
  validateRoyalty,
  nearToYocto,
  MAX_METADATA_LEN,
  firstPlayable,
  gatewayUrl,
  ipfsUri,
} from './shared.js';
import {
  generateTextCardSvg,
  resolveTheme,
  isBackgroundKey,
  isFontKey,
  isMarkColor,
  isMarkShape,
  isTitleAlign,
  isCardFormat,
  isCardFormatPalette,
  moodForCardFormat,
  CARD_FORMAT_REGISTRY,
  type BackgroundKey,
  type CardFormat,
  type FontKey,
  type MarkColor,
  type MarkShape,
  type TitleAlign,
} from '@onsocial/text-card';
import {
  getProfileName,
  resolveCreatorAvatarDataUri,
} from './profileLookup.js';
import { rasterizeTextCard } from './card-raster.js';

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
  /** Edition size (1–100). Each purchase mints one copy until sold out. */
  copies?: number;
  /** Max editions per purchase call (1–10). Default 1 when omitted on-chain. */
  maxPerPurchase?: number;
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
   * always preserved. Avatar is inlined into the permanent PNG.
   */
  creator?: {
    accountId: string;
    displayName?: string;
    avatar?: string;
  };
  /** Auto-card theming. Unknown keys fall back to defaults. */
  cardBg?: BackgroundKey | string;
  cardFont?: FontKey | string;
  /** Per-card customisation knobs. Validated; persisted in `extra.theme`. */
  cardMarkColor?: MarkColor | string;
  cardMarkShape?: MarkShape | string;
  cardTitleAlign?: TitleAlign | string;
  /** Locked curated card layout. */
  cardFormat?: CardFormat | string;
  /** Curated finish approved for `cardFormat`. */
  cardPalette?: string;
  /** Proof image CID for Receipt and Proof layouts. */
  cardPhotoCid?: string;
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
 *   - /compose/prepare/lazy-list   → returns action for SDK NEP-366 signing
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
    media = await resolveExistingMediaCid(req.mediaCid, req.mediaHash);
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
    let creator = req.creator ?? { accountId };
    if (!creator.displayName) {
      const profileName = await getProfileName(creator.accountId);
      if (profileName) {
        creator = { ...creator, displayName: profileName };
      }
    }
    const avatarDataUri = await resolveCreatorAvatarDataUri(
      creator.accountId,
      creator.avatar
    );
    if (avatarDataUri) {
      creator = { ...creator, avatar: avatarDataUri };
    } else {
      // Truly unset — never silently drop a face that was set;
      // resolveCreatorAvatarDataUri throws ComposeError(502) instead.
      const { avatar: _omit, ...rest } = creator;
      creator = rest;
    }
    let cardFormat: CardFormat | undefined;
    let resolvedCardBg = req.cardBg;
    if (req.cardFormat != null) {
      if (!isCardFormat(req.cardFormat)) {
        throw new ComposeError(400, `Unknown cardFormat: ${req.cardFormat}`);
      }
      cardFormat = req.cardFormat;
      const requestedPalette = req.cardPalette;
      if (
        requestedPalette != null &&
        !isCardFormatPalette(cardFormat, requestedPalette)
      ) {
        throw new ComposeError(
          400,
          `Unsupported ${requestedPalette} finish for ${cardFormat} cards.`
        );
      }
      const spec = CARD_FORMAT_REGISTRY[cardFormat];
      if (req.title.length > spec.maxCharacters) {
        throw new ComposeError(
          400,
          `${spec.label} cards support up to ${spec.maxCharacters} characters (got ${req.title.length}).`
        );
      }
      if (spec.requiresPhoto && !req.cardPhotoCid) {
        throw new ComposeError(
          400,
          `${spec.label} cards require cardPhotoCid (proof photo).`
        );
      }
      resolvedCardBg = moodForCardFormat(cardFormat, requestedPalette);
    }
    if (resolvedCardBg && !isBackgroundKey(resolvedCardBg)) {
      throw new ComposeError(400, `Unknown cardBg: ${resolvedCardBg}`);
    }
    if (req.cardFont && !isFontKey(req.cardFont)) {
      throw new ComposeError(400, `Unknown cardFont: ${req.cardFont}`);
    }
    if (req.cardMarkColor && !isMarkColor(req.cardMarkColor)) {
      throw new ComposeError(
        400,
        `Unknown cardMarkColor: ${req.cardMarkColor}`
      );
    }
    if (req.cardMarkShape && !isMarkShape(req.cardMarkShape)) {
      throw new ComposeError(
        400,
        `Unknown cardMarkShape: ${req.cardMarkShape}`
      );
    }
    if (req.cardTitleAlign && !isTitleAlign(req.cardTitleAlign)) {
      throw new ComposeError(
        400,
        `Unknown cardTitleAlign: ${req.cardTitleAlign}`
      );
    }
    const theme = resolveTheme({ bg: resolvedCardBg, font: req.cardFont });
    const themeForCard: {
      bg?: string;
      font?: string;
      markColor?: MarkColor;
      markShape?: MarkShape;
      titleAlign?: TitleAlign;
    } = {
      bg: theme.bg,
      font: theme.font,
      ...(req.cardMarkColor && {
        markColor: req.cardMarkColor as MarkColor,
      }),
      ...(req.cardMarkShape && {
        markShape: req.cardMarkShape as MarkShape,
      }),
      ...(req.cardTitleAlign && {
        titleAlign: req.cardTitleAlign as TitleAlign,
      }),
    };
    const sourcePost =
      req.extra && typeof req.extra === 'object'
        ? (req.extra as { sourcePost?: { postId?: string } }).sourcePost
        : undefined;
    const photoDataUri = req.cardPhotoCid
      ? await fetchImageAsDataUri(gatewayUrl(req.cardPhotoCid))
      : undefined;
    const svg = generateTextCardSvg({
      title: req.title,
      description: req.description,
      creator,
      ...(cardFormat ? { format: cardFormat } : {}),
      theme: themeForCard,
      ...(photoDataUri ? { photo: photoDataUri } : {}),
      provenance: {
        issuedAt: Date.now(),
        ...(typeof sourcePost?.postId === 'string' && sourcePost.postId
          ? { postId: sourcePost.postId }
          : {}),
      },
    });
    // The immutable listing cover is rendered once from the bundled fonts.
    const png = rasterizeTextCard(svg);
    media = await uploadToLighthouse({
      buffer: png,
      fieldname: 'image',
      originalname: `card-${Date.now()}.png`,
      mimetype: 'image/png',
      size: png.length,
    });
    req.extra = {
      ...(req.extra || {}),
      theme: {
        bg: theme.bg,
        font: theme.font,
        ...(cardFormat && { format: cardFormat }),
        ...(cardFormat && {
          palette:
            req.cardPalette ?? CARD_FORMAT_REGISTRY[cardFormat].defaultPalette,
        }),
        ...(req.cardMarkColor && { markColor: req.cardMarkColor }),
        ...(req.cardMarkShape && { markShape: req.cardMarkShape }),
        ...(req.cardTitleAlign && { titleAlign: req.cardTitleAlign }),
        ...(req.cardPhotoCid && { photoCid: req.cardPhotoCid }),
      },
    };
    logger.info(
      { accountId, size: media.size, theme: themeForCard },
      'Compose lazy-list: text-only card inlined as data: URI on-chain'
    );
  }

  // ── Build NEP-177 metadata ────────────────────────────────────────
  // Store the dedicated-gateway https URL on-chain (not `ipfs://...`) so
  // wallets render reliably without depending on the public IPFS DHT.
  const copies =
    typeof req.copies === 'number' && Number.isFinite(req.copies)
      ? Math.min(100, Math.max(1, Math.floor(req.copies)))
      : 1;

  const tokenMetadata: Record<string, unknown> = {
    title: req.title,
    ...(req.description && { description: req.description }),
    ...(media && { media: media.url }),
    ...(media?.hash && { media_hash: media.hash }),
    copies,
    ...(req.extra && { extra: JSON.stringify(req.extra) }),
  };

  // Upload full metadata JSON to Lighthouse (OpenSea-compatible).
  // Mirror mint: keep gateway `media` for wallets, plus `media_ipfs` CID
  // for permanent / gateway-agnostic resolution, and `animation_url` so a
  // listing minted from a video plays on marketplaces instead of showing
  // only its still cover frame.
  const isIpfsMedia = !!media && !!media.cid;
  const playable = firstPlayable(req.extra);
  const fullMetadata = {
    ...tokenMetadata,
    ...(media && { image: media.url }),
    ...(isIpfsMedia && media && { media_ipfs: ipfsUri(media.cid) }),
    ...(isIpfsMedia && media && { media_url: media.url }),
    name: req.title,
    ...(req.description && { description: req.description }),
    ...(req.extra || {}),
    ...(playable && {
      animation_url: gatewayUrl(playable.cid),
      animation_ipfs: ipfsUri(playable.cid),
    }),
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
  const maxPerPurchase =
    typeof req.maxPerPurchase === 'number' &&
    Number.isFinite(req.maxPerPurchase)
      ? Math.min(10, Math.max(1, Math.floor(req.maxPerPurchase)))
      : undefined;

  const action: Record<string, unknown> = {
    type: 'create_lazy_listing',
    metadata: tokenMetadata,
    price: nearToYocto(req.priceNear),
    ...(req.royalty && { royalty: req.royalty }),
    ...(req.appId && { app_id: req.appId }),
    ...(req.transferable != null && { transferable: req.transferable }),
    ...(req.burnable != null && { burnable: req.burnable }),
    ...(req.expiresAt != null && { expires_at: req.expiresAt }),
    ...(maxPerPurchase != null && { max_per_purchase: maxPerPurchase }),
  };

  return {
    action,
    targetAccount: resolveTarget(req.targetAccount),
    media,
    metadata,
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
  targetAccount?: string,
  quantity = 1
): LazyListingSimpleResult {
  if (!listingId) throw new ComposeError(400, 'Missing listingId');
  const qty = Number.isFinite(quantity)
    ? Math.min(10, Math.max(1, Math.floor(quantity)))
    : 1;
  return {
    action: {
      type: 'purchase_lazy_listing',
      listing_id: listingId,
      quantity: qty,
    },
    targetAccount: resolveTarget(targetAccount),
  };
}
