// ---------------------------------------------------------------------------
// FromPost — convenience flows that turn an existing post into either
// a minted scarce or a lazy listing. Reuses the post's first IPFS media
// CID with no re-upload, and links the source post via `extra.sourcePost`.
// ---------------------------------------------------------------------------

import type {
  LazyListingOptions,
  MintOptions,
  MintResponse,
  RelayResponse,
} from '../../types.js';
import {
  extractPostMedia,
  inferPostScarceKind,
  isPostRow,
  postCoords,
  type ExtractedPost,
  type MintFromPostOptions,
  type PostSource,
} from '../../builders/scarces/from-post.js';
import type { SocialModule } from '../social.js';
import type { ScarcesTokensApi, ScarceTokenView } from './tokens.js';
import type { ScarcesLazyApi } from './lazy.js';
import type { ScarcesCollectionsApi } from './collections.js';
import type { QueryModule } from '../../query/index.js';
import type {
  ScarcesCollectionCurrentRow,
  ScarcesEventRow,
} from '../../query/scarces.js';

function priceNearFromYocto(raw: string): string | undefined {
  try {
    const yocto = BigInt(raw);
    const whole = yocto / 1_000_000_000_000_000_000_000_000n;
    const frac = yocto % 1_000_000_000_000_000_000_000_000n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(24, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  } catch {
    return undefined;
  }
}

/** Title length above which we hard-truncate (keeps wallet grids tidy). */
const TITLE_MAX = 108;
const CARD_TITLE_LIMITS = {
  thought: 108,
  poster: 96,
  letter: 120,
  journal: 120,
  mono: 80,
  receipt: 60,
  proof: 56,
} as const;

const AUTHOR_EVENTS_TTL_MS = 15_000;

type AuthorEventsEntry = { at: number; rows: ScarcesEventRow[] };
type AuthorEventsBucket = {
  cache: Map<string, AuthorEventsEntry>;
  inflight: Map<string, Promise<ScarcesEventRow[]>>;
};

/** Per-QueryModule so clients/tests never share stale author event rows. */
const authorEventsByQuery = new WeakMap<QueryModule, AuthorEventsBucket>();

function authorEventsBucket(query: QueryModule): AuthorEventsBucket {
  let bucket = authorEventsByQuery.get(query);
  if (!bucket) {
    bucket = { cache: new Map(), inflight: new Map() };
    authorEventsByQuery.set(query, bucket);
  }
  return bucket;
}

/**
 * One author events query shared across every `fromPost.embed` call in a
 * short window — a home feed of own posts must not N× Hasura.
 */
async function scarceEventsForAuthor(
  query: QueryModule,
  author: string,
  limit: number
): Promise<ScarcesEventRow[]> {
  const { cache, inflight } = authorEventsBucket(query);
  const key = `${author.trim().toLowerCase()}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < AUTHOR_EVENTS_TTL_MS) {
    return cached.rows;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = query.scarces
    .events({ author, limit })
    .then((rows) => {
      cache.set(key, { at: Date.now(), rows });
      inflight.delete(key);
      return rows;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, promise);
  return promise;
}

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
function deriveTitle(text: string, maxCharacters = TITLE_MAX): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/)[0]!.trim();
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]!.trim();
  // Prefer the first sentence if it's clearly a headline (notably
  // shorter than the rest and within TITLE_MAX).
  if (
    firstSentence &&
    firstSentence.length < trimmed.length &&
    firstSentence.length <= maxCharacters
  ) {
    return firstSentence;
  }
  if (
    firstLine &&
    firstLine.length < trimmed.length &&
    firstLine.length <= maxCharacters
  ) {
    return firstLine;
  }
  if (trimmed.length <= maxCharacters) return trimmed;
  // Hard-truncate. Try to end on a word boundary so the wallet ellipsis
  // does not attach to a half-word.
  const window = trimmed.slice(0, maxCharacters);
  const lastSpace = window.lastIndexOf(' ');
  // Only honor the word boundary if it leaves at least half the title.
  if (lastSpace >= maxCharacters / 2)
    return window.slice(0, lastSpace).trimEnd();
  return window.trimEnd();
}

interface SourcePostLink {
  author?: string;
  postId?: string;
  path?: string;
  groupId?: string;
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
      groupId: stringField(nested, 'groupId'),
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

/** Provenance fields available when minting/listing from a PostRow. */
interface SourcePostContext {
  groupId?: string;
}

function sourcePostContext(post: PostSource): SourcePostContext {
  if (!isPostRow(post)) return {};
  const groupId = post.groupId?.trim();
  return groupId ? { groupId } : {};
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
  status:
    | 'none'
    | 'lazy_listing'
    | 'drop'
    | 'listed'
    | 'auction'
    | 'sold'
    | 'minted';
  /** Token id, if a real (non-lazy) NFT exists. */
  tokenId?: string;
  /** Listing id (fixed-price market or lazy listing). */
  listingId?: string;
  /** Primary-sale Drop (collection) when this post backs a Drop edition. */
  collectionId?: string;
  /** Drop / listing creator (catalog), not necessarily the post author. */
  creatorId?: string;
  /** Hub / app attribution when known. */
  appId?: string;
  /** Soft Series branding id when the Drop carries `metadata.series`. */
  seriesId?: string;
  /** Series display title when known. */
  seriesTitle?: string;
  /** Medium taxonomy (`art` / `video` / `audio` / `thought` / …). */
  mediumKind?: string;
  /** Active auction id, if any. */
  auctionId?: string;
  /** Current asking / bid price in NEAR (string, decimal). */
  priceNear?: string;
  /** Edition size when known (NEP-177 copies / Drop total supply). */
  copies?: number;
  /** Unsold editions still on the live lazy listing or Drop. */
  remaining?: number;
  /**
   * Auto text-card mood key (`extra.theme.bg`) when the listing has no
   * photo cover. Useful for client-side previews before media is fetched.
   */
  cardBg?: string;
  /**
   * Resolved cover URL for in-feed / sheet art (IPFS gateway or https).
   * Usually the listing's NEP-177 `metadata.media` (photo or text-card).
   */
  mediaUrl?: string;
  /** Latest event row used to derive `status` (for debugging / extra fields). */
  latest?: ScarcesEventRow;
  /** All matching events (most recent first), capped by `limit`. */
  events: ScarcesEventRow[];
}

function remainingFromEventExtra(
  extraData: string | null | undefined
): number | undefined {
  if (!extraData) return undefined;
  try {
    const extra = JSON.parse(extraData) as Record<string, unknown>;
    const raw = extra.remaining ?? extra.remainingEditions;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(0, Math.floor(raw));
    }
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) return Math.max(0, n);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Coarse trade status from the newest matching event.
 * Order matters: sold / cancelled must win over the lazy event family, because
 * indexer rows use `LAZY_LISTING_UPDATE` + `purchased` / `cancelled`.
 * Lazy purchases with `remaining > 0` stay `lazy_listing` (multi-copy).
 */
export function derivePostScarceStatus(
  row: Pick<
    ScarcesEventRow,
    'operation' | 'eventType' | 'tokenId' | 'extraData' | 'collectionId'
  >
): PostScarceEmbed['status'] {
  const op = (row.operation ?? '').toLowerCase();
  const et = (row.eventType ?? '').toLowerCase();
  const lazyFamily = et.includes('lazy');
  const collectionFamily = et.includes('collection');

  if (
    op === 'purchased' ||
    op === 'purchase' ||
    op === 'buy' ||
    op === 'sold_out' ||
    op === 'offer_accepted'
  ) {
    if (lazyFamily && op !== 'sold_out') {
      const remaining = remainingFromEventExtra(row.extraData);
      if (remaining != null && remaining > 0) return 'lazy_listing';
    }
    if (collectionFamily && op !== 'sold_out') {
      const remaining = remainingFromEventExtra(row.extraData);
      if (remaining != null && remaining > 0) return 'drop';
    }
    return 'sold';
  }

  // Cancelled / expired lazy drop — treat as clear so the author can list again.
  if (op === 'cancelled' || op === 'canceled' || op === 'expired') {
    return row.tokenId ? 'minted' : 'none';
  }

  if (
    et.includes('auction') ||
    op.includes('bid') ||
    op === 'auction_created' ||
    op === 'auction_bid'
  ) {
    return 'auction';
  }

  // Indexer: LAZY_LISTING_UPDATE + created | price_updated | expiry_updated.
  // Legacy tests / older relays also used lazy_create / create_lazy_listing.
  if (lazyFamily || op === 'lazy_create' || op === 'create_lazy_listing') {
    return 'lazy_listing';
  }

  // Primary-sale Drop created from (or linked to) this post.
  if (
    collectionFamily ||
    op === 'create_collection' ||
    (op === 'create' && Boolean(row.collectionId))
  ) {
    const remaining = remainingFromEventExtra(row.extraData);
    if (remaining === 0) return 'sold';
    return 'drop';
  }

  if (
    et.includes('listing') ||
    op === 'list' ||
    op === 'sell' ||
    op === 'list_native'
  ) {
    return 'listed';
  }

  return 'minted';
}

function seriesFromJson(value: unknown): {
  seriesId?: string;
  seriesTitle?: string;
} {
  const parsed = parseJsonObject(value);
  if (!parsed) return {};
  const nested = asRecord(parsed.series);
  if (nested) {
    const seriesId = stringField(nested, 'id');
    const seriesTitle = stringField(nested, 'title');
    return {
      ...(seriesId ? { seriesId } : {}),
      ...(seriesTitle ? { seriesTitle } : {}),
    };
  }
  const seriesId = stringField(parsed, 'series');
  return seriesId ? { seriesId } : {};
}

function mediumKindFromJson(value: unknown): string | undefined {
  const parsed = parseJsonObject(value);
  if (!parsed) return undefined;
  const raw = stringField(parsed, 'kind')?.trim().toLowerCase();
  if (!raw) return undefined;
  return raw === 'music' ? 'audio' : raw;
}

function promoteIdentityFromEvent(
  out: PostScarceEmbed,
  latest: ScarcesEventRow
): void {
  const collectionId = latest.collectionId?.trim();
  const appId = latest.appId?.trim();
  if (collectionId) out.collectionId = collectionId;
  if (appId) out.appId = appId;
  const medium = mediumKindFromJson(latest.extraData);
  if (medium) out.mediumKind = medium;
  const series = seriesFromJson(latest.extraData);
  if (series.seriesId) out.seriesId = series.seriesId;
  if (series.seriesTitle) out.seriesTitle = series.seriesTitle;
}

function embedFromCollectionRow(
  row: ScarcesCollectionCurrentRow
): PostScarceEmbed {
  const remaining =
    typeof row.remaining === 'number' && Number.isFinite(row.remaining)
      ? Math.max(0, Math.floor(row.remaining))
      : undefined;
  const copies =
    typeof row.totalSupply === 'number' && Number.isFinite(row.totalSupply)
      ? Math.max(0, Math.floor(row.totalSupply))
      : undefined;
  const priceNear =
    row.price?.trim() && /^\d+$/.test(row.price.trim())
      ? priceNearFromYocto(row.price.trim())
      : undefined;
  const medium =
    row.mediumKind?.trim().toLowerCase() ||
    (row.kind?.trim().toLowerCase() === 'music'
      ? 'audio'
      : row.kind?.trim().toLowerCase()) ||
    mediumKindFromJson(row.extraJson) ||
    undefined;
  const series = {
    ...seriesFromJson(row.extraJson),
    ...seriesFromJson(row.metadata),
  };
  const status: PostScarceEmbed['status'] =
    remaining === 0 || row.cancelled || row.banned
      ? 'sold'
      : row.paused
        ? 'minted'
        : 'drop';
  return {
    status,
    collectionId: row.collectionId,
    ...(row.appId?.trim() ? { appId: row.appId.trim() } : {}),
    ...(series.seriesId ? { seriesId: series.seriesId } : {}),
    ...(series.seriesTitle ? { seriesTitle: series.seriesTitle } : {}),
    ...(medium ? { mediumKind: medium } : {}),
    ...(priceNear ? { priceNear } : {}),
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(row.media?.trim() ? { mediaUrl: row.media.trim() } : {}),
    events: [],
  };
}

function collectionSourcePost(
  row: ScarcesCollectionCurrentRow
): SourcePostLink | null {
  if (row.sourcePostPath?.trim()) {
    return { path: row.sourcePostPath.trim() };
  }
  const fromExtra = sourcePostFromJson(row.extraJson);
  if (fromExtra) return fromExtra;
  const template = parseJsonObject(row.metadataTemplate);
  if (!template) return null;
  return sourcePostFromJson(template.extra) ?? sourcePostFromObject(template);
}

export class ScarcesFromPostApi {
  constructor(
    private _tokens: ScarcesTokensApi,
    private _lazy: ScarcesLazyApi,
    private _social?: SocialModule,
    private _query?: QueryModule,
    private _collections?: ScarcesCollectionsApi
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
    const mintOpts = this._buildMintOpts(
      author,
      postId,
      extracted,
      opts,
      sourcePostContext(post)
    );
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
    const base = this._buildMintOpts(
      author,
      postId,
      extracted,
      opts,
      sourcePostContext(post)
    );
    const lazyOpts: LazyListingOptions = {
      title: base.title,
      priceNear,
      ...(base.creator ? { creator: base.creator } : {}),
      ...(base.description ? { description: base.description } : {}),
      ...(base.mediaCid ? { mediaCid: base.mediaCid } : {}),
      ...(base.image ? { image: base.image } : {}),
      ...(base.copies != null ? { copies: base.copies } : {}),
      ...(base.royalty ? { royalty: base.royalty } : {}),
      ...(base.appId ? { appId: base.appId } : {}),
      ...(base.extra ? { extra: base.extra } : {}),
      ...(base.cardBg ? { cardBg: base.cardBg } : {}),
      ...(base.cardFormat ? { cardFormat: base.cardFormat } : {}),
      ...(base.cardPalette ? { cardPalette: base.cardPalette } : {}),
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
   * Create a primary-sale Drop from a post (collection edition set).
   * Stamps `extra.sourcePost` + inferred medium (`art` / `video` / …) so the
   * Drop is discoverable on `/drops` and the post CTA can mint via
   * `collections.purchaseFrom`.
   *
   * ```ts
   * await os.scarces.fromPost.createDrop(row, '1', {
   *   copies: 25,
   *   collectionId: 'sunset-prints-a1b2c3',
   * });
   * ```
   */
  async createDrop(
    post: PostSource,
    priceNear: string,
    opts: MintFromPostOptions & {
      /** Globally unique collection id (required). */
      collectionId: string;
      transferable?: boolean;
      burnable?: boolean;
      startTime?: string;
      endTime?: string;
      series?: { id: string; title?: string };
      /** Storage buffer for create_collection (yoctoNEAR). */
      depositYocto?: string;
    }
  ): Promise<RelayResponse & { collectionId: string }> {
    if (!this._collections) {
      throw new Error(
        'scarces.fromPost.createDrop: requires ScarcesCollectionsApi. Construct via the OnSocial client.'
      );
    }
    const { author, postId } = postCoords(post);
    const extracted = await this._readPost(post);
    const base = this._buildMintOpts(
      author,
      postId,
      extracted,
      opts,
      sourcePostContext(post)
    );
    const totalSupply = opts.copies ?? base.copies ?? 1;
    const seriesMeta = opts.series?.id?.trim()
      ? {
          series: {
            id: opts.series.id.trim(),
            ...(opts.series.title?.trim()
              ? { title: opts.series.title.trim() }
              : {}),
          },
        }
      : undefined;
    const response = await this._collections.create(
      {
        collectionId: opts.collectionId,
        totalSupply,
        title: base.title,
        ...(priceNear ? { priceNear } : {}),
        ...(base.description ? { description: base.description } : {}),
        ...(base.mediaCid ? { mediaCid: base.mediaCid } : {}),
        ...(base.image ? { image: base.image } : {}),
        ...(base.royalty ? { royalty: base.royalty } : {}),
        ...(base.appId ? { appId: base.appId } : {}),
        ...(base.creator ? { creator: base.creator } : {}),
        ...(base.cardBg ? { cardBg: base.cardBg } : {}),
        ...(base.cardFormat ? { cardFormat: base.cardFormat } : {}),
        ...(base.cardPalette ? { cardPalette: base.cardPalette } : {}),
        ...(base.cardFont ? { cardFont: base.cardFont } : {}),
        ...(base.cardMarkColor ? { cardMarkColor: base.cardMarkColor } : {}),
        ...(base.cardMarkShape ? { cardMarkShape: base.cardMarkShape } : {}),
        ...(base.cardTitleAlign ? { cardTitleAlign: base.cardTitleAlign } : {}),
        ...(base.cardPhotoCid ? { cardPhotoCid: base.cardPhotoCid } : {}),
        ...(opts.transferable != null
          ? { transferable: opts.transferable }
          : {}),
        ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
        ...(opts.startTime ? { startTime: opts.startTime } : {}),
        ...(opts.endTime ? { endTime: opts.endTime } : {}),
        ...(seriesMeta ? { metadata: seriesMeta } : {}),
        extra: {
          ...(base.extra ?? {}),
          kind:
            (typeof base.extra?.kind === 'string' && base.extra.kind) ||
            inferPostScarceKind(extracted),
        },
      },
      opts.depositYocto !== undefined
        ? { depositYocto: opts.depositYocto }
        : undefined
    );
    return { ...response, collectionId: opts.collectionId };
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
   * (`Buy`, `Bid`, `Sold`, list).
   *
   * ```ts
   * const e = await os.scarces.fromPost.embed(post);
   * if (e.status === 'lazy_listing') showBuy(e.priceNear, e.listingId);
   * else if (e.status === 'listed') showBuy(e.priceNear, e.tokenId);
   * else if (e.status === 'auction') showBid(e.tokenId, e.priceNear);
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
    // the client. Author scoping + short TTL/inflight cache keeps a feed
    // of the same author's posts to one events query.
    const all = await scarceEventsForAuthor(this._query, author, limit);
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

    // Primary Drop path — live catalog keyed by source_post_path / template extra.
    const dropEmbed = await this._matchCollectionEmbed(
      author,
      postId,
      wantPath
    );
    if (matched.length === 0) {
      return dropEmbed ?? { status: 'none', events: [] };
    }

    const latest = matched[0]!;
    const out: PostScarceEmbed = {
      status: derivePostScarceStatus(latest),
      events: matched,
      latest,
    };
    if (latest.tokenId) out.tokenId = latest.tokenId;
    if (latest.listingId) out.listingId = latest.listingId;
    promoteIdentityFromEvent(out, latest);

    // Pull price / theme / remaining from extraData if present (best-effort).
    try {
      const extra = latest.extraData
        ? (JSON.parse(latest.extraData) as Record<string, unknown>)
        : null;
      if (extra && typeof extra === 'object') {
        const p =
          (extra['priceNear'] as string | undefined) ??
          (extra['price_near'] as string | undefined);
        if (typeof p === 'string' && p) out.priceNear = p;

        const remaining = remainingFromEventExtra(latest.extraData);
        if (remaining != null) out.remaining = remaining;

        const copiesRaw = extra['copies'] ?? extra['total_supply'];
        if (typeof copiesRaw === 'number' && Number.isFinite(copiesRaw)) {
          out.copies = Math.max(0, Math.floor(copiesRaw));
        }

        const theme = extra['theme'];
        if (theme && typeof theme === 'object' && !Array.isArray(theme)) {
          const bg = (theme as Record<string, unknown>)['bg'];
          if (typeof bg === 'string' && bg) out.cardBg = bg;
        }
      }
    } catch {
      /* noop */
    }

    // Drop catalog wins identity when events lack collectionId (lazy list).
    if (dropEmbed?.collectionId && !out.collectionId) {
      out.collectionId = dropEmbed.collectionId;
      if (dropEmbed.appId && !out.appId) out.appId = dropEmbed.appId;
      if (dropEmbed.seriesId && !out.seriesId)
        out.seriesId = dropEmbed.seriesId;
      if (dropEmbed.seriesTitle && !out.seriesTitle) {
        out.seriesTitle = dropEmbed.seriesTitle;
      }
      if (dropEmbed.mediumKind && !out.mediumKind) {
        out.mediumKind = dropEmbed.mediumKind;
      }
    }
    // Prefer Drop status when the post's primary product is a minting Drop.
    if (
      dropEmbed &&
      dropEmbed.status === 'drop' &&
      (out.status === 'none' || out.status === 'minted')
    ) {
      return { ...dropEmbed, events: matched, latest };
    }
    return out;
  }

  private async _matchCollectionEmbed(
    author: string,
    postId: string,
    wantPath: string
  ): Promise<PostScarceEmbed | null> {
    if (!this._query?.scarces?.collectionsCurrent) return null;
    // Prefer indexed source_post_path when the column is live.
    try {
      const byPath = await this._query.scarces.collectionsCurrent({
        sourcePostPath: wantPath,
        includeUnavailable: true,
        limit: 5,
      });
      const pathHit = byPath.find((row) => {
        const source = collectionSourcePost(row);
        return sourcePostMatches(source, author, postId, wantPath);
      });
      if (pathHit) return embedFromCollectionRow(pathHit);
    } catch {
      /* column / Hasura may not expose sourcePostPath yet */
    }

    // Fallback: creator catalog + client parse of template/extra.
    try {
      const byCreator = await this._query.scarces.collectionsCurrent({
        creatorId: author,
        includeUnavailable: true,
        limit: 40,
      });
      const hit = byCreator.find((row) => {
        const source = collectionSourcePost(row);
        return sourcePostMatches(source, author, postId, wantPath);
      });
      return hit ? embedFromCollectionRow(hit) : null;
    } catch {
      return null;
    }
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
    opts: MintFromPostOptions,
    source: SourcePostContext = {}
  ): MintOptions {
    const text = extracted.text;
    const autoTitleLimit = opts.cardFormat
      ? CARD_TITLE_LIMITS[opts.cardFormat]
      : TITLE_MAX;
    const title =
      opts.title ?? (deriveTitle(text, autoTitleLimit) || `Post ${postId}`);
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
    // - Photo-led Receipt / Proof formats: the card SVG is the cover and
    //   the post photo is embedded inside it; do not pass `mediaCid` or the
    //   raw post image would override the rendered card.
    // - Keep the legacy receipt-mood route for existing callers.
    const isPhotoCardFormat =
      opts.cardFormat === 'receipt' || opts.cardFormat === 'proof';
    const isReceiptMood = (opts.cardBg ?? '').startsWith('receipt-');
    const usesPhotoCard = isPhotoCardFormat || isReceiptMood;
    const explicitMediaCid = opts.mediaCid ?? extracted.mediaCid;
    const resolvedMediaCid = usesPhotoCard ? undefined : explicitMediaCid;
    const resolvedPhotoCid = usesPhotoCard
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

    // ── Playable ──────────────────────────────────────────────────────────
    // Video / audio can never be the NEP-177 cover (wallets render `media`
    // as a still image), so the cover is a frame or a chosen photo and the
    // clip itself is recorded here for surfaces that can play it.
    const playableExtra =
      extracted.playable.length > 0
        ? { playable: extracted.playable }
        : undefined;

    return {
      title,
      // Bake the post author into auto text-cards — not the listing signer.
      // Gateway defaults `creator` to the caller otherwise, so a greenghost
      // listing of voter2's post would stamp greenghost on the artwork.
      creator: { accountId: author },
      ...(description ? { description } : {}),
      ...(opts.copies != null ? { copies: opts.copies } : {}),
      ...(opts.royalty ? { royalty: opts.royalty } : {}),
      ...(opts.appId ? { appId: opts.appId } : {}),
      ...(opts.receiverId ? { receiverId: opts.receiverId } : {}),
      ...(opts.image ? { image: opts.image } : {}),
      ...(resolvedMediaCid ? { mediaCid: resolvedMediaCid } : {}),
      ...(opts.cardBg ? { cardBg: opts.cardBg } : {}),
      ...(opts.cardFormat ? { cardFormat: opts.cardFormat } : {}),
      ...(opts.cardPalette ? { cardPalette: opts.cardPalette } : {}),
      ...(opts.cardFont ? { cardFont: opts.cardFont } : {}),
      ...(opts.cardMarkColor ? { cardMarkColor: opts.cardMarkColor } : {}),
      ...(opts.cardMarkShape ? { cardMarkShape: opts.cardMarkShape } : {}),
      ...(opts.cardTitleAlign ? { cardTitleAlign: opts.cardTitleAlign } : {}),
      ...(resolvedPhotoCid ? { cardPhotoCid: resolvedPhotoCid } : {}),
      extra: {
        // Indexer + embeds key off author/postId/path (+ groupId). Listing
        // / mint block time comes from the receipt — do not mirror PostRow
        // blockHeight/blockTimestamp into extra.
        sourcePost: {
          author,
          postId,
          path: `${author}/post/${postId}`,
          ...(source.groupId ? { groupId: source.groupId } : {}),
        },
        mintedAt: Date.now(),
        // Medium for Collectibles / Market tabs. Callers may override via
        // `opts.extra.kind`.
        kind: inferPostScarceKind(extracted),
        ...(galleryExtra ?? {}),
        ...(playableExtra ?? {}),
        ...(opts.extra ?? {}),
      },
    };
  }
}
