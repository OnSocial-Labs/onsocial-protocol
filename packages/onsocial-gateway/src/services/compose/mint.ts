/**
 * Compose: Mint — mint Scarces with auto-uploaded media + metadata.
 */

import { config } from '../../config/index.js';
import {
  type UploadedFile,
  type UploadResult,
  ComposeError,
  uploadToLighthouse,
  uploadJsonToLighthouse,
  uploadSvgToLighthouse,
  fetchImageAsDataUri,
  intentAuth,
  relayExecute,
  extractTxHash,
  logger,
  validateRoyalty,
  MAX_METADATA_LEN,
  gatewayUrl,
  ipfsUri,
  verifyCidLive,
} from './shared.js';
import {
  generateTextCardSvg,
  resolveTheme,
  isBackgroundKey,
  isFontKey,
  isMarkColor,
  isMarkShape,
  isTitleAlign,
  type BackgroundKey,
  type FontKey,
  type MarkColor,
  type MarkShape,
  type TitleAlign,
} from '@onsocial/text-card';
import { getProfileName } from './profileLookup.js';

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
  /**
   * Skip the auto-generated branded text-card image when no media is supplied.
   * Default: false (auto-card is generated and uploaded so wallets render an
   * actual image instead of an empty placeholder).
   */
  skipAutoMedia?: boolean;
  /**
   * Optional creator profile rendered onto the auto-generated text card
   * (avatar initial + display name + @handle). When omitted, the SDK
   * caller's `accountId` is used so author attribution is always present.
   */
  creator?: {
    accountId: string;
    displayName?: string;
  };
  /**
   * Auto-card theming. Both keys must be in the @onsocial/text-card
   * catalog; unknown values fall back to the default theme. Persisted
   * on-chain in `extra.theme` so future re-renders reproduce the look.
   */
  cardBg?: BackgroundKey | string;
  cardFont?: FontKey | string;
  /**
   * Per-card customisation knobs (all optional). Validated against the
   * @onsocial/text-card catalog; unknown values are rejected at the
   * boundary. Persisted in `extra.theme` for round-tripping.
   */
  cardMarkColor?: MarkColor | string;
  cardMarkShape?: MarkShape | string;
  cardTitleAlign?: TitleAlign | string;
  /**
   * Optional photo CID rendered as an inset chip on the auto-generated
   * text-card. Resolved through our public gateway. Only applies when
   * the gateway is generating a text-card (i.e. no `mediaCid` and no
   * uploaded `imageFile`); otherwise ignored.
   */
  cardPhotoCid?: string;
}

export interface ComposeMintResult {
  txHash: string;
  media?: UploadResult;
  metadata?: UploadResult;
  /** Present when relayer was called with wait=true. */
  success?: boolean;
  status?: string;
  error?: string;
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
      // Reuse existing IPFS CID (e.g. post image already uploaded via
      // /compose/set). Render through our configured public gateway —
      // operators should point this at `cdn.onsocial.id` so the URL on-chain
      // is brand-stable and provider-swappable via DNS.
      media = {
        cid: req.mediaCid,
        size: 0,
        url: gatewayUrl(req.mediaCid),
        hash: req.mediaHash || '',
      };
      logger.info(
        { accountId, cid: media.cid },
        'Compose mint: reusing existing media CID'
      );
    } else if (imageFile) {
      media = await uploadToLighthouse(imageFile);
      // Verify retrievable before we commit a reference to this CID on-chain.
      await verifyCidLive(media.cid);
      logger.info(
        { accountId, cid: media.cid, size: media.size },
        'Compose mint: image uploaded to Lighthouse'
      );
    } else if (!req.skipAutoMedia) {
      // No image and no reused CID — generate a typographic text-card SVG
      // and inline it as a data: URI. This makes the card render directly
      // from on-chain metadata in every wallet, with zero IPFS dependency.
      // Author attribution defaults to the calling accountId so every card
      // has provenance baked into the artwork itself.
      let creator = req.creator ?? { accountId };
      // When the caller didn't pass a displayName, look it up from
      // core-onsocial so the byline shows the user's profile name
      // (e.g. "Alice") instead of just their accountId.
      if (!creator.displayName) {
        const profileName = await getProfileName(creator.accountId);
        if (profileName) {
          creator = { ...creator, displayName: profileName };
        }
      }
      // Reject unknown theme keys at the boundary; never trust client
      // strings into a stylesheet. Allowlist enforced by the catalog.
      if (req.cardBg && !isBackgroundKey(req.cardBg)) {
        throw new ComposeError(400, `Unknown cardBg: ${req.cardBg}`);
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
      // Receipt mood: photo + title length are part of the format,
      // not optional. Reject early so callers get a clear 400 instead
      // of a silently-truncated card.
      // Receipt is a layout (short claim + photo-as-proof), one mood per
      // palette finish. Validate format requirements at the boundary so
      // callers get a clear 400 instead of a silently truncated card.
      if (typeof req.cardBg === 'string' && req.cardBg.startsWith('receipt-')) {
        if (!req.cardPhotoCid) {
          throw new ComposeError(
            400,
            'Receipt mood requires cardPhotoCid (proof photo).'
          );
        }
        if (req.title.length > 60) {
          throw new ComposeError(
            400,
            `Receipt title exceeds 60 chars (got ${req.title.length}).`
          );
        }
      }
      const theme = resolveTheme({ bg: req.cardBg, font: req.cardFont });
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
      // Inline the proof photo as a `data:image/...` URI inside the
      // SVG. Wallets render NFT media via `<img src=svg-url>`, and
      // browsers block external `<image href=https://...>` references
      // when an SVG is loaded that way → broken icon in the chip. We
      // still upload the photo CID separately (persisted in
      // `theme.photoCid`) so the on-chain payload remains
      // content-addressable.
      const photoDataUri = req.cardPhotoCid
        ? await fetchImageAsDataUri(gatewayUrl(req.cardPhotoCid))
        : undefined;
      const svg = generateTextCardSvg({
        title: req.title,
        description: req.description,
        creator,
        theme: themeForCard,
        ...(photoDataUri ? { photo: photoDataUri } : {}),
      });
      // Upload the SVG to Lighthouse so wallets get a normal
      // https://cdn…/ipfs/<cid> URL on-chain. Inlining as data: URI
      // works in browsers but most NFT wallet renderers reject
      // `media: data:image/svg+xml;…` and show a broken image.
      media = await uploadSvgToLighthouse(svg, `card-${Date.now()}.svg`);
      // Persist resolved theme keys so indexers / future re-renders can
      // reproduce the look without parsing the SVG.
      req.extra = {
        ...(req.extra || {}),
        theme: {
          bg: theme.bg,
          font: theme.font,
          ...(req.cardMarkColor && { markColor: req.cardMarkColor }),
          ...(req.cardMarkShape && { markShape: req.cardMarkShape }),
          ...(req.cardTitleAlign && { titleAlign: req.cardTitleAlign }),
          ...(req.cardPhotoCid && { photoCid: req.cardPhotoCid }),
        },
      };
      logger.info(
        { accountId, cid: media.cid, size: media.size, theme: themeForCard },
        'Compose mint: auto-generated text card uploaded to Lighthouse'
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
    //
    // `media` holds either a `data:` URI (auto text-card) or an https URL
    // pointing at our dedicated Lighthouse gateway (uploaded image / reused
    // CID). We store that URL directly on-chain so wallets render reliably
    // without depending on the public IPFS DHT.
    const tokenMetadata: Record<string, unknown> = {
      title: req.title,
      ...(req.description && { description: req.description }),
      ...(media && { media: media.url }),
      ...(media && { media_hash: media.hash }),
      ...(req.copies && { copies: req.copies }),
      ...(req.extra && { extra: JSON.stringify(req.extra) }),
    };

    // 3. Upload full metadata JSON to Lighthouse (OpenSea-compatible).
    //
    // For uploaded/reused IPFS media (cid !== '') we add `media_ipfs` and
    // `media_url` sidecar fields so off-chain consumers can resolve through
    // any gateway (their preferred one, ours, or `ipfs://`). The on-chain
    // `media` field stays as the resolved gateway URL because it renders
    // reliably across every wallet today.
    const isIpfsMedia = !!media && !!media.cid;
    const fullMetadata = {
      ...tokenMetadata,
      ...(media && { image: media.url }),
      ...(isIpfsMedia && media && { media_ipfs: ipfsUri(media.cid) }),
      ...(isIpfsMedia && media && { media_url: media.url }),
      name: req.title,
      ...(req.description && { description: req.description }),
      ...(req.extra || {}),
    };

    metadata = await uploadJsonToLighthouse(fullMetadata);
    await verifyCidLive(metadata.cid);
    tokenMetadata.reference = metadata.url;
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
  imageFile?: UploadedFile,
  opts: { wait?: boolean } = {}
): Promise<ComposeMintResult> {
  const built = await buildMintAction(accountId, req, imageFile);
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
