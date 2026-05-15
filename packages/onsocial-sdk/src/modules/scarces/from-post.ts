// ---------------------------------------------------------------------------
// FromPost — convenience flows that turn an existing post into either
// a minted scarce or a lazy listing. Reuses the post's first IPFS media
// CID with no re-upload, and links the source post via `extra.sourcePost`.
// ---------------------------------------------------------------------------

import type {
  LazyListingOptions,
  MintOptions,
  MintResponse,
} from '../../types.js';
import {
  extractPostMedia,
  isPostRow,
  postCoords,
  type ExtractedPost,
  type MintFromPostOptions,
  type PostSource,
} from '../../builders/scarces/from-post.js';
import type { SocialModule } from '../social.js';
import type { ScarcesTokensApi, ScarceTokenView } from './tokens.js';
import type { ScarcesLazyApi } from './lazy.js';
import type { QueryModule } from '../../query/index.js';
import type { ScarcesEventRow } from '../../query/scarces.js';

/** Title length above which we hard-truncate (keeps wallet grids tidy). */
const TITLE_MAX = 80;

/**
 * Derive a short, headline-style title from longer post text so it
 * differs meaningfully from `description`. Strategy:
 *   1. First non-empty line if it's a clear standalone (shorter than
 *      the rest), OR
 *   2. First sentence (split on `.`/`!`/`?`/newline) if shorter than
 *      the rest, OR
 *   3. Whole text if already ≤ TITLE_MAX, OR
 *   4. Hard-truncated to TITLE_MAX chars on a word boundary when
 *      possible. We deliberately do NOT append our own ellipsis —
 *      wallets and grids add their own truncation marker, and a
 *      doubled `…` looks broken.
 */
function deriveTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/)[0]!.trim();
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]!.trim();
  // Prefer the first sentence if it's clearly a headline (notably
  // shorter than the rest and within TITLE_MAX).
  if (
    firstSentence &&
    firstSentence.length < trimmed.length &&
    firstSentence.length <= TITLE_MAX
  ) {
    return firstSentence;
  }
  if (
    firstLine &&
    firstLine.length < trimmed.length &&
    firstLine.length <= TITLE_MAX
  ) {
    return firstLine;
  }
  if (trimmed.length <= TITLE_MAX) return trimmed;
  // Hard-truncate. Try to end on a word boundary so the wallet ellipsis
  // does not attach to a half-word.
  const window = trimmed.slice(0, TITLE_MAX);
  const lastSpace = window.lastIndexOf(' ');
  // Only honor the word boundary if it leaves at least half the title.
  if (lastSpace >= TITLE_MAX / 2) return window.slice(0, lastSpace).trimEnd();
  return window.trimEnd();
}

interface SourcePostLink {
  author?: string;
  postId?: string;
  path?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function stringField(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value ? value : undefined;
}

function sourcePostFromObject(
  obj: Record<string, unknown>
): SourcePostLink | null {
  const nested = asRecord(obj.sourcePost);
  if (nested) {
    return {
      author: stringField(nested, 'author'),
      postId: stringField(nested, 'postId'),
      path: stringField(nested, 'path'),
    };
  }

  const author = stringField(obj, 'postAuthor');
  const postId = stringField(obj, 'postId');
  const path = stringField(obj, 'postPath');
  if (author || postId || path) return { author, postId, path };
  return null;
}

function sourcePostFromJson(value: unknown): SourcePostLink | null {
  const parsed = parseJsonObject(value);
  return parsed ? sourcePostFromObject(parsed) : null;
}

function sourcePostMatches(
  sourcePost: SourcePostLink | null,
  author: string,
  postId: string,
  wantPath: string
): boolean {
  if (!sourcePost) return false;
  if (sourcePost.path && sourcePost.path === wantPath) return true;
  return sourcePost.author === author && sourcePost.postId === postId;
}

function tokenSourcePost(token: ScarceTokenView | null): SourcePostLink | null {
  return sourcePostFromJson(token?.metadata?.extra ?? null);
}

/**
 * Snapshot of the trade-state of a scarce minted from a given post.
 * Returned by {@link ScarcesFromPostApi.embed}.
 */
export interface PostScarceEmbed {
  /** High-level state, easy to switch on for in-feed rendering. */
  status: 'none' | 'lazy_listing' | 'listed' | 'auction' | 'sold' | 'minted';
  /** Token id, if a real (non-lazy) NFT exists. */
  tokenId?: string;
  /** Listing id (fixed-price market or lazy listing). */
  listingId?: string;
  /** Active auction id, if any. */
  auctionId?: string;
  /** Current asking / bid price in NEAR (string, decimal). */
  priceNear?: string;
  /** Latest event row used to derive `status` (for debugging / extra fields). */
  latest?: ScarcesEventRow;
  /** All matching events (most recent first), capped by `limit`. */
  events: ScarcesEventRow[];
}

export class ScarcesFromPostApi {
  constructor(
    private _tokens: ScarcesTokensApi,
    private _lazy: ScarcesLazyApi,
    private _social?: SocialModule,
    private _query?: QueryModule
  ) {}

  /**
   * Mint a post as a 1-of-N collectible scarce. Reuses the post's first
   * IPFS media CID by default — no re-upload — and links the new scarce
   * back to its source post via `extra.sourcePost`.
   *
   * ```ts
   * await os.scarces.fromPost.mint(row, { copies: 10 });
   * ```
   */
  async mint(
    post: PostSource,
    opts: MintFromPostOptions = {}
  ): Promise<MintResponse> {
    const { author, postId } = postCoords(post);
    const extracted = await this._readPost(post);
    const mintOpts = this._buildMintOpts(author, postId, extracted, opts);
    return this._tokens.mint(mintOpts);
  }

  /**
   * Create a lazy listing for a post (mint-on-purchase at a fixed price).
   * Same media reuse + source-post linking as `mint`.
   *
   * ```ts
   * await os.scarces.fromPost.list(row, '5', { royalty: { 'alice.near': 1000 } });
   * ```
   */
  async list(
    post: PostSource,
    priceNear: string,
    opts: MintFromPostOptions & {
      transferable?: boolean;
      burnable?: boolean;
      expiresAt?: string;
    } = {}
  ): Promise<MintResponse> {
    const { author, postId } = postCoords(post);
    const extracted = await this._readPost(post);
    const base = this._buildMintOpts(author, postId, extracted, opts);
    const lazyOpts: LazyListingOptions = {
      title: base.title,
      priceNear,
      ...(base.description ? { description: base.description } : {}),
      ...(base.mediaCid ? { mediaCid: base.mediaCid } : {}),
      ...(base.image ? { image: base.image } : {}),
      ...(base.royalty ? { royalty: base.royalty } : {}),
      ...(base.appId ? { appId: base.appId } : {}),
      ...(base.extra ? { extra: base.extra } : {}),
      ...(base.cardBg ? { cardBg: base.cardBg } : {}),
      ...(base.cardFont ? { cardFont: base.cardFont } : {}),
      ...(base.cardMarkColor ? { cardMarkColor: base.cardMarkColor } : {}),
      ...(base.cardMarkShape ? { cardMarkShape: base.cardMarkShape } : {}),
      ...(base.cardTitleAlign ? { cardTitleAlign: base.cardTitleAlign } : {}),
      ...(base.cardPhotoCid ? { cardPhotoCid: base.cardPhotoCid } : {}),
      ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
      ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    };
    return this._lazy.create(lazyOpts);
  }

  /**
   * Mint a post as a **receipt** — a permanent proof-card with a short
   * claim and a photo as evidence. The killer mint-from-post format:
   * "Shipped." + screenshot, "Sold out in 4 hours." + dashboard, etc.
   *
   * Hard rules (enforced here, before any network call):
   * - title (or post text if no `opts.title`) must be ≤ 60 chars
   * - a photo is required — either from `opts.cardPhotoCid` or the
   *   post's first image
   *
   * Pass `palette` to pick the finish
   * (`'light'` default, or `'night' | 'noir' | 'dusk'`).
   *
   * ```ts
   * await os.scarces.fromPost.mintReceipt(row, { copies: 1 });
   * await os.scarces.fromPost.mintReceipt(row, { palette: 'noir' });
   * ```
   */
  async mintReceipt(
    post: PostSource,
    opts: Omit<MintFromPostOptions, 'cardBg'> & {
      palette?: 'light' | 'night' | 'noir' | 'dusk';
    } = {}
  ): Promise<MintResponse> {
    const extracted = await this._readPost(post);
    const title = opts.title ?? extracted.text;
    if (title.length > 60) {
      throw new Error(
        `Receipt cards are for short claims (≤60 chars, got ${title.length}). For longer thoughts use os.scarces.fromPost.mint() with a different mood.`
      );
    }
    const photoCid = opts.cardPhotoCid ?? extracted.mediaCid;
    if (!photoCid) {
      throw new Error(
        'Receipt cards require a photo (proof). Pass opts.cardPhotoCid or mint from a post with media.'
      );
    }
    const palette = opts.palette ?? 'light';
    const cardBg = `receipt-${palette}`;
    // Strip our local-only `palette` knob before forwarding.
    const { palette: _palette, ...rest } = opts;
    return this.mint(post, {
      ...rest,
      title,
      cardBg,
      cardPhotoCid: photoCid,
    });
  }

  /**
   * One-shot lookup of the trade-state of any scarce minted (or lazily
   * listed) from this post. Returns `{status: 'none', events: []}` when
   * the post has never been turned into a scarce.
   *
   * Designed for in-feed rendering — call once per post when the card
   * mounts and switch on `embed.status` to decide which CTA to show
   * (`Buy`, `Bid`, `Sold out`, `Mint`).
   *
   * ```ts
   * const e = await os.scarces.fromPost.embed(post);
   * if (e.status === 'lazy_listing') showBuy(e.priceNear, e.listingId);
   * else if (e.status === 'auction') showBid(e.auctionId, e.priceNear);
   * else if (e.status === 'none') showMintCTA();
   * ```
   */
  async embed(
    post: PostSource,
    opts: { limit?: number } = {}
  ): Promise<PostScarceEmbed> {
    if (!this._query) {
      throw new Error(
        'scarces.fromPost.embed: requires a QueryModule. Construct via the OnSocial client (which wires this automatically).'
      );
    }
    const { author, postId } = postCoords(post);
    const wantPath = `${author}/post/${postId}`;
    const limit = opts.limit ?? 50;
    // Filter server-side by author; we cannot _eq inside extraData (TEXT)
    // through Hasura without JSONB, so we narrow by author and parse on
    // the client. Author scoping keeps this cheap (one creator's events).
    const all = await this._query.scarces.events({ author, limit });
    let matched = all.filter((row) =>
      sourcePostMatches(
        sourcePostFromJson(row.extraData),
        author,
        postId,
        wantPath
      )
    );
    if (matched.length === 0) {
      matched = await this._matchByTokenMetadata(all, author, postId, wantPath);
    }
    if (matched.length === 0) return { status: 'none', events: [] };

    const latest = matched[0]!;
    const out: PostScarceEmbed = {
      status: 'minted',
      events: matched,
      latest,
    };
    if (latest.tokenId) out.tokenId = latest.tokenId;
    if (latest.listingId) out.listingId = latest.listingId;

    // Derive a coarse status from the most recent event's type/operation.
    // We deliberately keep this lossy & cheap; callers that need precise
    // sub-states (e.g. partially-sold-out lazy listings) should use the
    // dedicated ScarcesQuery helpers.
    const op = (latest.operation ?? '').toLowerCase();
    const et = (latest.eventType ?? '').toLowerCase();
    if (et.includes('auction') || op.includes('bid')) {
      out.status = 'auction';
    } else if (
      et.includes('lazy') ||
      op === 'lazy_create' ||
      op === 'create_lazy_listing'
    ) {
      out.status = 'lazy_listing';
    } else if (et.includes('listing') || op === 'list' || op === 'sell') {
      out.status = 'listed';
    } else if (op === 'purchase' || op === 'buy' || op === 'sold_out') {
      out.status = 'sold';
    }
    // Pull a price out of extraData if present (best-effort).
    try {
      const extra = latest.extraData
        ? (JSON.parse(latest.extraData) as Record<string, unknown>)
        : null;
      const p =
        extra && typeof extra === 'object'
          ? ((extra['priceNear'] as string | undefined) ??
            (extra['price_near'] as string | undefined))
          : undefined;
      if (p) out.priceNear = p;
    } catch {
      /* noop */
    }
    return out;
  }

  private async _matchByTokenMetadata(
    rows: ScarcesEventRow[],
    author: string,
    postId: string,
    wantPath: string
  ): Promise<ScarcesEventRow[]> {
    const tokenIds = [
      ...new Set(
        rows
          .map((row) => row.tokenId)
          .filter((tokenId): tokenId is string => !!tokenId)
      ),
    ];
    if (tokenIds.length === 0) return [];

    const checks = await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const token = await this._tokens.get(tokenId);
          return [
            tokenId,
            sourcePostMatches(tokenSourcePost(token), author, postId, wantPath),
          ] as const;
        } catch {
          return [tokenId, false] as const;
        }
      })
    );

    const matchedTokenIds = new Set(
      checks.filter(([, ok]) => ok).map(([tokenId]) => tokenId)
    );
    if (matchedTokenIds.size === 0) return [];
    return rows.filter(
      (row) => row.tokenId !== null && matchedTokenIds.has(row.tokenId)
    );
  }

  private async _readPost(post: PostSource): Promise<ExtractedPost> {
    if (isPostRow(post)) {
      return extractPostMedia(post.value);
    }
    if (!this._social) {
      throw new Error(
        'scarces.fromPost: PostRef requires a SocialModule. Pass a PostRow instead, or construct via the OnSocial client (which wires this automatically).'
      );
    }
    const entry = await this._social.getOne(`post/${post.postId}`, post.author);
    return extractPostMedia(
      (entry?.value as string | Record<string, unknown> | undefined) ?? null
    );
  }

  private _buildMintOpts(
    author: string,
    postId: string,
    extracted: ExtractedPost,
    opts: MintFromPostOptions
  ): MintOptions {
    const text = extracted.text;
    const title = opts.title ?? (deriveTitle(text) || `Post ${postId}`);
    // Only drop description when it would be byte-identical to the
    // title (true duplication). Anything else — even small differences
    // like a trailing tag or a second sentence — is signal worth
    // surfacing in the wallet detail view.
    const explicitDescription = opts.description;
    const fallbackDescription = !text || text === title ? undefined : text;
    const description = explicitDescription ?? fallbackDescription;

    // ── Media routing ──────────────────────────────────────────────
    // - Default: post photo becomes the cover (or no media → gateway
    //   renders a text-only auto-card).
    // - Receipt mood (cardBg starts with `receipt-`): the receipt SVG
    //   is the cover and the photo is embedded inside it as proof; we
    //   must not also pass `mediaCid` or the post photo would override
    //   the rendered card.
    const isReceiptMood = (opts.cardBg ?? '').startsWith('receipt-');
    const explicitMediaCid = opts.mediaCid ?? extracted.mediaCid;
    const resolvedMediaCid = isReceiptMood ? undefined : explicitMediaCid;
    const resolvedPhotoCid = isReceiptMood
      ? (opts.cardPhotoCid ?? extracted.mediaCid)
      : opts.cardPhotoCid;

    // ── Gallery ───────────────────────────────────────────────────────────
    // For multi-photo posts, persist the full list under `extra.gallery`
    // so marketplaces / future viewers can show the rest. The cover
    // (first CID) stays in `media` per NEP-177.
    const galleryExtra =
      extracted.mediaCids.length > 1
        ? { gallery: extracted.mediaCids }
        : undefined;

    return {
      title,
      ...(description ? { description } : {}),
      ...(opts.copies != null ? { copies: opts.copies } : {}),
      ...(opts.royalty ? { royalty: opts.royalty } : {}),
      ...(opts.appId ? { appId: opts.appId } : {}),
      ...(opts.receiverId ? { receiverId: opts.receiverId } : {}),
      ...(opts.image ? { image: opts.image } : {}),
      ...(resolvedMediaCid ? { mediaCid: resolvedMediaCid } : {}),
      ...(opts.cardBg ? { cardBg: opts.cardBg } : {}),
      ...(opts.cardFont ? { cardFont: opts.cardFont } : {}),
      ...(opts.cardMarkColor ? { cardMarkColor: opts.cardMarkColor } : {}),
      ...(opts.cardMarkShape ? { cardMarkShape: opts.cardMarkShape } : {}),
      ...(opts.cardTitleAlign ? { cardTitleAlign: opts.cardTitleAlign } : {}),
      ...(resolvedPhotoCid ? { cardPhotoCid: resolvedPhotoCid } : {}),
      extra: {
        sourcePost: {
          author,
          postId,
          path: `${author}/post/${postId}`,
        },
        mintedAt: Date.now(),
        ...(galleryExtra ?? {}),
        ...(opts.extra ?? {}),
      },
    };
  }
}
