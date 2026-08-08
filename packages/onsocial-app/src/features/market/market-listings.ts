import type {
  OnSocial,
  ScarcesActiveListingRow,
  ScarcesCollectionCurrentRow,
  ScarcesEventRow,
} from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { resolvePostThreadHrefsFromSourcePaths } from '@/lib/post-routes';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  inferAudioFormatFromPlayableCount,
  parseAudioFormat,
  parseDropFacets,
} from '@/features/scarces/drop-facets';
import { isAudioMediumKind } from '@/features/market/market-medium';

/**
 * Market data plane (indexer-first, same pattern as feed/standings):
 *
 * - Browse / sales / activity → OnAPI `os.query.scarces.*` (Hasura catalog + events)
 * - Buy / bid / cancel verify → NEAR contract views at action time
 * - “Yours” owned inventory → indexer `scarces_token_owners` (RPC fallback)
 * - Feed scarce hydrate → `activeListings` (verify at buy/bid with RPC)
 * - RPC browse fallback → only on true OnAPI/Hasura failure, never on empty catalog
 *
 * Times: listed = `listedBlockTimestamp` / event time; minted = first mint-family
 * event via `tokenHistory` (detail sheets only). Legacy test rows may omit fields.
 */

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Mint-family ops used to resolve “Minted …” on detail sheets. */
const SCARCE_MINT_OPS = new Set([
  'quick_mint',
  'creator_mint',
  'purchased',
  'purchase',
]);

interface LazyListingRecord {
  creator_id?: string;
  metadata?: {
    title?: string | null;
    description?: string | null;
    media?: string | null;
    copies?: number | string | null;
    extra?: string | null;
  };
  price?: string | { '0'?: string } | null;
  created_at?: number;
  /** Editions already minted (collections-aligned). */
  minted_count?: number | string | null;
}

/** Playable asset behind a scarce whose cover is a still frame. */
export interface ScarcePlayableMedia {
  url: string;
  mime: string;
  /** IPFS CID when known — used for same-origin download via `/api/ipfs`. */
  cid?: string;
  /** Track / clip label when present in `extra.playable`. */
  title?: string;
  /** Optional plain-text lyrics for this track (`extra.playable[].lyrics`). */
  lyrics?: string;
}

export interface MarketListingItem {
  /** Primary mint-on-purchase, secondary resale, or native auction. */
  kind: 'lazy' | 'native' | 'auction';
  /** Lazy listing id (`ll:…`). */
  listingId?: string;
  /** Native token id (`s:…`) for secondary listings / auctions. */
  tokenId?: string;
  /** Seller: mint creator for lazy, current owner for native/auction. */
  creatorId: string;
  /**
   * Original mint creator when different from seller.
   * Omitted when equal to `creatorId` (primary listings).
   */
  artistId?: string;
  title: string;
  /** NEP-177 description — full post text when minted from a post. */
  description?: string;
  /** Ask (fixed) or current high / reserve (auction). */
  priceNear: string;
  /** Makes auction prices unambiguous without duplicating price values. */
  priceLabel?: 'Ask' | 'Reserve' | 'High bid';
  blockTimestamp: number;
  mediaUrl?: string | null;
  sourcePostPath?: string;
  /** Resolved app thread href (personal or guild). */
  postHref?: string;
  /** Text-card mood key from listing `extra.theme.bg`, when present. */
  cardBg?: string;
  /** Clip behind a video scarce — the cover stays the still frame. */
  playable?: ScarcePlayableMedia;
  /** Full playable list (album tracks); `playable` is the first entry. */
  playables?: ScarcePlayableMedia[];
  /** Total edition size (NEP-177 copies). */
  copies?: number;
  /** Unsold editions still on this listing. */
  remaining?: number;
  /** Auction clock (`Sale.expires_at`, ns). Null until first bid when duration-based. */
  expiresAtNs?: number | null;
  /** Auction bid count from nested `sale.auction.bid_count`. */
  bidCount?: number;
  /** Optional auction buy-now ask (NEAR). Bid ≥ this settles immediately. */
  buyNowNear?: string | null;
  /**
   * Medium taxonomy from metadata `extra.kind` (`art` | `writing` | `audio`).
   * Distinct from listing `kind` (lazy / native / auction).
   */
  mediumKind?: string | null;
  /** Audio release format from `extra.audioFormat` (or inferred). */
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  /** Discovery facets (genres / subjects) from `extra.facets`. */
  facets?: string[];
}

/** Browse sort for Market listings. */
export type MarketListingSort =
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'ending';

/** Wallet-owned scarce NFT for Market “Yours”. */
export interface OwnedScarceItem {
  tokenId: string;
  title: string;
  /** NEP-177 description — full post text when present. */
  description?: string;
  mediaUrl?: string | null;
  ownerId: string;
  /**
   * Drop id when `tokenId` is `collectionId:edition` (not post `s:` scarces).
   */
  collectionId?: string | null;
  /** Medium taxonomy from metadata `extra.kind` when set. */
  mediumKind?: string | null;
  /** Audio release format from `extra.audioFormat` (or inferred). */
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  /** Discovery facets (genres / subjects) from `extra.facets`. */
  facets?: string[];
  /** Listing state for an owned native scarce. */
  listingKind: 'fixed' | 'auction' | null;
  /** Set when this token is already listed for resale or auction. */
  listedPriceNear?: string | null;
  /** Auction bids on the current listing — cancel is blocked when > 0. */
  bidCount?: number;
  /** Auction clock (`Sale.expires_at`, ns) when listed as auction. */
  expiresAtNs?: number | null;
  /** Original post path from token `metadata.extra` when present. */
  sourcePostPath?: string;
}

/** `drop-1:3` → `drop-1`; post scarces (`s:…`) have no collection page. */
export function collectionIdFromTokenId(tokenId: string): string | null {
  const id = tokenId.trim();
  if (!id || id.startsWith('s:')) return null;
  const colon = id.lastIndexOf(':');
  if (colon <= 0) return null;
  const collectionId = id.slice(0, colon).trim();
  return collectionId || null;
}

/** `drop-1:3` → 3 for variation media / edition titles. */
export function editionSeatFromTokenId(tokenId: string): number | null {
  const id = tokenId.trim();
  if (!id || id.startsWith('s:')) return null;
  const part = id.slice(id.lastIndexOf(':') + 1).trim();
  const seat = Number(part);
  return Number.isSafeInteger(seat) && seat >= 1 ? seat : null;
}

const VARIATION_MEDIA_PLACEHOLDER = /\{(seat_number|index|token_id)\}/;

/**
 * Title/media for an owned edition from `scarces_collections_current`.
 * Prefer `metadataTemplate` (where drop art actually lives) over thin
 * top-level title/media columns; substitute variation seats per token.
 */
export function displayFromOwnedCollectionCatalog(
  catalog: ScarcesCollectionCurrentRow,
  tokenId: string
): {
  title: string | null;
  mediaUrl: string | null;
  description?: string;
  extraJson: string | null;
  kind: string | null;
} {
  const collectionId = catalog.collectionId?.trim() || '';
  let title = catalog.title?.trim() || null;
  let media = catalog.media?.trim() || null;
  let description = catalog.description?.trim() || undefined;
  let extraJson = catalog.extraJson?.trim() || null;
  let kind = catalog.kind?.trim() || null;

  const templateRaw = catalog.metadataTemplate?.trim();
  if (templateRaw) {
    try {
      const meta = JSON.parse(templateRaw) as Record<string, unknown>;
      if (typeof meta.title === 'string' && meta.title.trim()) {
        title = meta.title.trim();
      }
      if (typeof meta.description === 'string' && meta.description.trim()) {
        description = meta.description.trim();
      }
      if (typeof meta.media === 'string' && meta.media.trim()) {
        media = meta.media.trim();
      }
      if (typeof meta.extra === 'string' && meta.extra.trim()) {
        extraJson = meta.extra.trim();
      }
    } catch {
      // Keep column-level fields.
    }
  }

  if (
    media &&
    collectionId &&
    VARIATION_MEDIA_PLACEHOLDER.test(media)
  ) {
    const seat = editionSeatFromTokenId(tokenId);
    if (seat != null) {
      media = media
        .replace(/\{seat_number\}/g, String(seat))
        .replace(/\{index\}/g, String(seat - 1))
        .replace(/\{token_id\}/g, tokenId);
    }
  }

  // Kind often only lives in template extra.
  if (!kind && extraJson) {
    const extra = parseExtra(extraJson);
    kind = mediumKindFromExtra(extra) ?? null;
  }

  return {
    title: title ? resolveTokenDisplayTitle(title, tokenId) : null,
    mediaUrl: resolveScarceMediaUrl(media),
    ...(description ? { description } : {}),
    extraJson,
    kind,
  };
}

function ownedItemNeedsTokenMeta(item: OwnedScarceItem): boolean {
  const title = item.title?.trim() || '';
  const thinTitle =
    !title ||
    title === 'Scarce' ||
    title === item.tokenId ||
    (Boolean(item.collectionId) && title === item.collectionId);
  return thinTitle || !item.mediaUrl;
}

interface ContractSaleRecord {
  owner_id?: string;
  sale_conditions?: string | { '0'?: string } | null;
  sale_type?:
    | {
        NativeScarce?: { token_id?: string };
        native_scarce?: { token_id?: string };
      }
    | { External?: unknown; external?: unknown }
    | string;
  auction?: unknown;
  expires_at?: number | null;
  created_at?: number | string | null;
}

interface ContractTokenRecord {
  token_id?: string;
  owner_id?: string;
  metadata?: {
    title?: string | null;
    description?: string | null;
    media?: string | null;
    extra?: string | null;
  } | null;
}

export interface MarketSaleItem {
  listingId?: string;
  tokenId?: string;
  buyerId?: string;
  sellerId?: string;
  creatorId?: string;
  title: string;
  priceNear: string;
  blockTimestamp: number;
  mediaUrl?: string | null;
  sourcePostPath?: string;
  postHref?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseExtra(extraData: string | null): Record<string, unknown> | null {
  if (!extraData) return null;
  try {
    return asRecord(JSON.parse(extraData));
  } catch {
    return null;
  }
}

function stringField(
  obj: Record<string, unknown> | null,
  key: string
): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function priceNearFromYocto(raw: unknown): string | null {
  const priceYocto =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          typeof (raw as { '0'?: string })['0'] === 'string'
        ? (raw as { '0': string })['0']
        : null;
  if (!priceYocto || !/^\d+$/.test(priceYocto)) return null;
  return yoctoToNear(priceYocto);
}

function timestampMs(raw: number | string | null | undefined): number {
  const timestamp = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) return 0;
  return timestamp > 1e15 ? Math.floor(timestamp / 1e6) : timestamp;
}

/**
 * Relative age for Market listed / sold / minted labels.
 * Accepts ms or ns-ish indexer timestamps.
 */
export function formatMarketRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const ms = timestamp > 1e15 ? Math.floor(timestamp / 1e6) : timestamp;
  const elapsed = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function priceNearFromRow(row: ScarcesEventRow): string {
  const extra = parseExtra(row.extraData);
  const fromExtra =
    stringField(extra, 'priceNear') ?? stringField(extra, 'price_near');
  if (fromExtra) return fromExtra;
  return (
    priceNearFromYocto(row.price) ??
    priceNearFromYocto(row.amount) ??
    row.price?.trim() ??
    '—'
  );
}

/**
 * Video / audio the scarce was minted from (`extra.playable`). The cover in
 * `media` is always a still — this is the clip behind it, so buy/bid sheets
 * can play what is actually being sold.
 */
/** Medium taxonomy (`art` / `writing` / `audio` / `thought` / `video` / …) from NEP-177 `extra.kind`. */
export function mediumKindFromExtra(
  extra: Record<string, unknown> | null
): string | undefined {
  const kind = stringField(extra, 'kind');
  if (!kind) return undefined;
  return kind.toLowerCase();
}

/** Parse listing `extraJson` blob for medium kind filtering. */
export function mediumKindFromExtraJson(
  extraJson: string | null | undefined
): string | undefined {
  return mediumKindFromExtra(parseExtra(extraJson ?? null));
}

/** Audio format + facets stamped on NEP-177 `extra` for discovery filters. */
function discoveryFieldsFromExtra(
  extra: Record<string, unknown> | null,
  playableCount = 0
): {
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  facets?: string[];
} {
  const mediumKind = mediumKindFromExtra(extra);
  const facets = parseDropFacets(extra, mediumKind);
  const audioFormat = isAudioMediumKind(mediumKind)
    ? (parseAudioFormat(extra?.audioFormat) ??
      inferAudioFormatFromPlayableCount(playableCount))
    : null;
  return {
    ...(audioFormat != null || isAudioMediumKind(mediumKind)
      ? { audioFormat: audioFormat ?? null }
      : {}),
    ...(facets.length > 0 ? { facets } : {}),
  };
}

function playablesFromExtra(
  extra: Record<string, unknown> | null
): ScarcePlayableMedia[] {
  const entries = extra?.playable;
  if (!Array.isArray(entries)) return [];
  const out: ScarcePlayableMedia[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    const cid = stringField(record, 'cid');
    const mime = stringField(record, 'mime');
    if (!cid || !mime) continue;
    const url = resolveScarceMediaUrl(cid);
    if (!url) continue;
    const title = stringField(record, 'title') ?? undefined;
    const lyricsRaw = stringField(record, 'lyrics');
    const lyrics = lyricsRaw?.trim() ? lyricsRaw : undefined;
    out.push({
      url,
      mime,
      cid,
      ...(title ? { title } : {}),
      ...(lyrics ? { lyrics } : {}),
    });
  }
  return out;
}

function sourcePostPathFromExtra(
  extra: Record<string, unknown> | null
): string | undefined {
  const nested = asRecord(extra?.sourcePost);
  if (nested) {
    const path = stringField(nested, 'path');
    if (path) return path;
    const author = stringField(nested, 'author');
    const postId = stringField(nested, 'postId');
    if (author && postId) return `${author}/post/${postId}`;
  }
  return (
    stringField(extra, 'postPath') ??
    stringField(extra, 'sourcePostPath') ??
    undefined
  );
}

export function resolveScarceMediaUrl(
  media: string | null | undefined
): string | null {
  if (!media?.trim()) return null;
  const trimmed = media.trim();
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('ipfs://')) {
    return resolveProfileMediaUrl(trimmed);
  }
  return resolveProfileMediaUrl(`ipfs://${trimmed}`);
}

function accountFromRow(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function authorFromSourcePostPath(
  path: string | null | undefined
): string | undefined {
  if (!path?.trim()) return undefined;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  const author = match?.[1]?.trim();
  return author || undefined;
}

/** Provenance account when it differs from the seller. */
function artistIdDistinctFromSeller(
  sellerId: string,
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const id = candidate?.trim();
    if (id && !accountIdsEqualSafe(id, sellerId)) return id;
  }
  return undefined;
}

export function hasUnresolvedTitleTemplate(title: string): boolean {
  return /#\{[^}]+\}|\{[a-z_]+\}/i.test(title);
}

/** Make legacy `#{id}` edition titles readable when metadata stored them raw. */
export function resolveTokenDisplayTitle(
  title: string,
  tokenId: string
): string {
  if (!hasUnresolvedTitleTemplate(title)) return title;
  const edition = tokenId.includes(':') ? tokenId.split(':').at(-1) : tokenId;
  return title
    .replace(/#\{id\}/gi, `#${edition}`)
    .replace(/\{token_id\}/gi, tokenId);
}

/** Keep native inventory in the canonical owner-management surface. */
export function excludeOwnedNativeListings(
  listings: MarketListingItem[],
  ownedTokenIds: ReadonlySet<string>
): MarketListingItem[] {
  return listings.filter(
    (item) =>
      !(
        item.tokenId &&
        (item.kind === 'native' || item.kind === 'auction') &&
        ownedTokenIds.has(item.tokenId)
      )
  );
}

export function saleTitle(
  row: Pick<ScarcesEventRow, 'extraData' | 'tokenId'>
): string {
  const extra = parseExtra(row.extraData);
  const titled =
    stringField(extra, 'title') ??
    stringField(extra, 'name') ??
    stringField(extra, 'tokenTitle') ??
    null;
  if (titled) return titled;
  const tokenId = row.tokenId?.trim();
  if (!tokenId) return 'Scarce';
  // Named collections / editions (e.g. royalty-test:1) keep their id.
  if (tokenId.includes(':') && !tokenId.startsWith('s:')) return tokenId;
  // Native token ids (s:319) — quiet label, not a raw id dump.
  return 'Scarce';
}

function saleMediaFromRow(
  row: Pick<ScarcesEventRow, 'extraData'>
): string | null {
  const extra = parseExtra(row.extraData);
  return (
    resolveScarceMediaUrl(
      stringField(extra, 'media') ??
        stringField(extra, 'mediaUrl') ??
        stringField(extra, 'mediaCid') ??
        null
    ) ?? null
  );
}

function saleSourcePostFromRow(
  row: Pick<ScarcesEventRow, 'extraData'>
): string | undefined {
  return sourcePostPathFromExtra(parseExtra(row.extraData));
}

function parseCount(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return undefined;
}

/** Remaining editions = copies − minted_count (post-migrate contract model). */
function remainingForListing(
  record: LazyListingRecord,
  copies: number | undefined
): number | undefined {
  if (copies == null) return undefined;
  const minted = parseCount(record.minted_count) ?? 0;
  return Math.max(0, copies - minted);
}

function listingFromRecord(
  listingId: string,
  record: LazyListingRecord
): MarketListingItem | null {
  const creatorId = record.creator_id?.trim();
  if (!creatorId) return null;
  const title = record.metadata?.title?.trim() || `Scarce · ${listingId}`;
  const description = record.metadata?.description?.trim() || undefined;
  const priceNear = priceNearFromYocto(record.price) ?? '—';
  const mediaUrl = resolveScarceMediaUrl(record.metadata?.media ?? null);
  const extra = parseExtra(record.metadata?.extra ?? null);
  const theme = asRecord(extra?.theme ?? null);
  const cardBg = stringField(theme, 'bg');
  const playables = playablesFromExtra(extra);
  const playable = playables[0];
  const createdAt = Number(record.created_at) || 0;
  // Contract timestamps are ns; feed/indexer use ms-ish seconds — normalize to ms for sort.
  const blockTimestamp =
    createdAt > 1e15 ? Math.floor(createdAt / 1e6) : createdAt;
  const copiesSafe = parseCount(record.metadata?.copies);
  const copies = copiesSafe != null && copiesSafe > 0 ? copiesSafe : undefined;
  const remaining = remainingForListing(record, copies);
  const mediumKind = mediumKindFromExtra(extra);
  const discovery = discoveryFieldsFromExtra(extra, playables.length);
  const sourcePostPath = sourcePostPathFromExtra(extra);
  const artistId = artistIdDistinctFromSeller(
    creatorId,
    authorFromSourcePostPath(sourcePostPath)
  );

  return {
    kind: 'lazy',
    listingId,
    creatorId,
    ...(artistId ? { artistId } : {}),
    title,
    ...(description && description !== title ? { description } : {}),
    priceNear,
    blockTimestamp,
    mediaUrl,
    sourcePostPath,
    ...(cardBg ? { cardBg } : {}),
    ...(playable ? { playable } : {}),
    ...(playables.length > 0 ? { playables } : {}),
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...discovery,
  };
}

function marketListingRowKey(item: MarketListingItem): string {
  if ((item.kind === 'native' || item.kind === 'auction') && item.tokenId) {
    return `${item.kind}:${item.tokenId}`;
  }
  if (item.listingId) return `lazy:${item.listingId}`;
  return `row:${item.creatorId}:${item.title}:${item.priceNear}`;
}

export { marketListingRowKey };

function isLiveLazyListing(item: MarketListingItem): boolean {
  return item.remaining == null || item.remaining > 0;
}

async function withResolvedPostHrefs(
  items: MarketListingItem[]
): Promise<MarketListingItem[]> {
  const hrefByPath = await resolvePostThreadHrefsFromSourcePaths(
    items.map((item) => item.sourcePostPath)
  );
  return items.map((item) => {
    if (item.postHref || !item.sourcePostPath) return item;
    const postHref = hrefByPath.get(item.sourcePostPath);
    return postHref ? { ...item, postHref } : item;
  });
}

async function withResolvedSalePostHrefs(
  items: MarketSaleItem[]
): Promise<MarketSaleItem[]> {
  const hrefByPath = await resolvePostThreadHrefsFromSourcePaths(
    items.map((item) => item.sourcePostPath)
  );
  return items.map((item) => {
    if (item.postHref || !item.sourcePostPath) return item;
    const postHref = hrefByPath.get(item.sourcePostPath);
    return postHref ? { ...item, postHref } : item;
  });
}

async function fetchSaleByTokenId(
  tokenId: string
): Promise<ContractSaleRecord | null> {
  try {
    return await viewNearContract<ContractSaleRecord | null>(
      SCARCES_CONTRACT,
      'get_sale',
      {
        scarce_contract_id: SCARCES_CONTRACT,
        token_id: tokenId,
      }
    );
  } catch {
    return null;
  }
}

function nativeTokenIdFromSale(sale: ContractSaleRecord): string | null {
  const saleType = sale.sale_type;
  if (!saleType || typeof saleType === 'string') return null;
  const native =
    ('NativeScarce' in saleType && saleType.NativeScarce) ||
    ('native_scarce' in saleType && saleType.native_scarce) ||
    null;
  if (!native || typeof native !== 'object') return null;
  const tokenId =
    typeof native.token_id === 'string' ? native.token_id.trim() : '';
  return tokenId || null;
}

function isFixedPriceNativeSale(sale: ContractSaleRecord): boolean {
  if (sale.auction != null) return false;
  return Boolean(nativeTokenIdFromSale(sale));
}

function isNativeAuctionSale(sale: ContractSaleRecord): boolean {
  return sale.auction != null && Boolean(nativeTokenIdFromSale(sale));
}

interface ContractAuctionState {
  reserve_price?: string | { '0'?: string } | null;
  highest_bid?: string | { '0'?: string } | null;
  min_bid_increment?: string | { '0'?: string } | null;
  buy_now_price?: string | { '0'?: string } | null;
  bid_count?: number;
}

function auctionDisplayPriceNear(sale: ContractSaleRecord): string | null {
  const auction = asRecord(sale.auction) as ContractAuctionState | null;
  if (!auction) return null;
  const highest = priceNearFromYocto(auction.highest_bid);
  if (highest && Number.parseFloat(highest) > 0) return highest;
  return priceNearFromYocto(auction.reserve_price);
}

function auctionPriceLabel(sale: ContractSaleRecord): 'Reserve' | 'High bid' {
  const auction = asRecord(sale.auction) as ContractAuctionState | null;
  const highest = priceNearFromYocto(auction?.highest_bid);
  return highest && Number.parseFloat(highest) > 0 ? 'High bid' : 'Reserve';
}

function auctionBidCount(sale: ContractSaleRecord): number | undefined {
  const auction = asRecord(sale.auction);
  if (!auction) return undefined;
  const raw = auction.bid_count ?? auction.bidCount;
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function auctionBuyNowNear(sale: ContractSaleRecord): string | null {
  const auction = asRecord(sale.auction) as ContractAuctionState | null;
  if (!auction) return null;
  return priceNearFromYocto(auction.buy_now_price);
}

function saleExpiresAtNs(sale: ContractSaleRecord): number | null | undefined {
  const raw = sale.expires_at;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function listingPriceValue(item: MarketListingItem): number {
  const n = Number.parseFloat(item.priceNear);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize auction `expires_at` to ms for sort / countdown helpers. */
export function auctionExpiresAtMs(
  expiresAtNs: number | null | undefined
): number | null {
  if (
    expiresAtNs == null ||
    !Number.isFinite(expiresAtNs) ||
    expiresAtNs <= 0
  ) {
    return null;
  }
  if (expiresAtNs > 1e15) return Math.floor(expiresAtNs / 1e6);
  if (expiresAtNs > 1e12) return expiresAtNs;
  return expiresAtNs * 1000;
}

export function sortMarketListings(
  items: MarketListingItem[],
  sort: MarketListingSort
): MarketListingItem[] {
  const copy = [...items];
  if (sort === 'price-asc') {
    return copy.sort(
      (a, b) =>
        listingPriceValue(a) - listingPriceValue(b) ||
        b.blockTimestamp - a.blockTimestamp
    );
  }
  if (sort === 'price-desc') {
    return copy.sort(
      (a, b) =>
        listingPriceValue(b) - listingPriceValue(a) ||
        b.blockTimestamp - a.blockTimestamp
    );
  }
  if (sort === 'ending') {
    // Auctions only — fixed/lazy rows (if present) sink below by recency.
    return copy.sort((a, b) => {
      const aAuction = a.kind === 'auction';
      const bAuction = b.kind === 'auction';
      if (aAuction !== bAuction) return aAuction ? -1 : 1;
      const aMs = auctionExpiresAtMs(a.expiresAtNs);
      const bMs = auctionExpiresAtMs(b.expiresAtNs);
      if (aMs != null && bMs != null) return aMs - bMs;
      if ((aMs != null) !== (bMs != null)) return aMs != null ? -1 : 1;
      return b.blockTimestamp - a.blockTimestamp;
    });
  }
  return copy.sort((a, b) => b.blockTimestamp - a.blockTimestamp);
}

async function fetchTokenRecord(
  tokenId: string
): Promise<ContractTokenRecord | null> {
  try {
    return await viewNearContract<ContractTokenRecord | null>(
      SCARCES_CONTRACT,
      'nft_token',
      { token_id: tokenId }
    );
  } catch {
    return null;
  }
}

function listingFromNativeSale(
  sale: ContractSaleRecord,
  token: ContractTokenRecord | null
): MarketListingItem | null {
  const tokenId = nativeTokenIdFromSale(sale);
  const sellerId = sale.owner_id?.trim();
  if (!tokenId || !sellerId) return null;
  const isAuction = isNativeAuctionSale(sale);
  const priceNear = isAuction
    ? auctionDisplayPriceNear(sale)
    : priceNearFromYocto(sale.sale_conditions);
  if (!priceNear) return null;
  const rawTitle =
    token?.metadata?.title?.trim() ||
    (tokenId.includes(':') && !tokenId.startsWith('s:') ? tokenId : 'Scarce');
  const title = resolveTokenDisplayTitle(rawTitle, tokenId);
  const description = token?.metadata?.description?.trim() || undefined;
  const mediaUrl = resolveScarceMediaUrl(token?.metadata?.media ?? null);
  const extra = parseExtra(token?.metadata?.extra ?? null);
  const mediumKind = mediumKindFromExtra(extra);
  const playables = playablesFromExtra(extra);
  const playable = playables[0];
  const discovery = discoveryFieldsFromExtra(extra, playables.length);
  const sourcePostPath = sourcePostPathFromExtra(extra);
  const artistId = artistIdDistinctFromSeller(
    sellerId,
    authorFromSourcePostPath(sourcePostPath)
  );
  return {
    kind: isAuction ? 'auction' : 'native',
    tokenId,
    creatorId: sellerId,
    ...(artistId ? { artistId } : {}),
    title,
    ...(description && description !== title ? { description } : {}),
    priceNear,
    priceLabel: isAuction ? auctionPriceLabel(sale) : 'Ask',
    blockTimestamp: timestampMs(sale.created_at),
    mediaUrl,
    sourcePostPath,
    ...(playable ? { playable } : {}),
    ...(playables.length > 0 ? { playables } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...discovery,
    ...(isAuction
      ? {
          expiresAtNs: saleExpiresAtNs(sale),
          bidCount: auctionBidCount(sale),
          buyNowNear: auctionBuyNowNear(sale),
        }
      : {}),
  };
}

/**
 * Discover native/auction candidates via indexer list events, then verify with
 * `get_sale` so delisted/sold rows never appear. Falls back to RPC sales dump.
 */
async function fetchNativeMarketListingsFromIndexer(
  limit: number
): Promise<MarketListingItem[]> {
  const client = createReadOnlyOnSocialClient();
  const created = await client.query.scarces.events({
    eventType: 'SCARCE_UPDATE',
    operation: ['list_native', 'auction_created'],
    limit: Math.min(limit * 3, 120),
  });

  const tokenIds: string[] = [];
  const seen = new Set<string>();
  for (const row of created) {
    const tokenId = row.tokenId?.trim();
    if (!tokenId || seen.has(tokenId)) continue;
    seen.add(tokenId);
    tokenIds.push(tokenId);
    if (tokenIds.length >= limit * 2) break;
  }
  if (tokenIds.length === 0) return [];

  const sales = await Promise.all(
    tokenIds.map((tokenId) => fetchSaleByTokenId(tokenId))
  );
  const live: ContractSaleRecord[] = [];
  for (let i = 0; i < tokenIds.length; i += 1) {
    const sale = sales[i];
    if (!sale) continue;
    if (!isFixedPriceNativeSale(sale) && !isNativeAuctionSale(sale)) continue;
    live.push(sale);
    if (live.length >= limit) break;
  }

  const tokens = await Promise.all(
    live.map((sale) => {
      const tokenId = nativeTokenIdFromSale(sale);
      return tokenId ? fetchTokenRecord(tokenId) : Promise.resolve(null);
    })
  );

  const items: MarketListingItem[] = [];
  for (let i = 0; i < live.length; i += 1) {
    const item = listingFromNativeSale(live[i]!, tokens[i] ?? null);
    if (item) items.push(item);
  }
  return items;
}

async function fetchNativeMarketListingsFromRpc(
  limit: number
): Promise<MarketListingItem[]> {
  let sales: ContractSaleRecord[] = [];
  try {
    sales = await viewNearContract<ContractSaleRecord[]>(
      SCARCES_CONTRACT,
      'get_sales_by_scarce_contract_id',
      {
        scarce_contract_id: SCARCES_CONTRACT,
        from_index: 0,
        limit: Math.min(limit * 2, 100),
      }
    );
  } catch {
    try {
      sales = await viewNearContract<ContractSaleRecord[]>(
        SCARCES_CONTRACT,
        'get_sales',
        { from_index: 0, limit: Math.min(limit * 2, 100) }
      );
    } catch {
      return [];
    }
  }

  const nativeSales = sales
    .filter((sale) => isFixedPriceNativeSale(sale) || isNativeAuctionSale(sale))
    .slice(0, limit);
  const tokens = await Promise.all(
    nativeSales.map((sale) => {
      const tokenId = nativeTokenIdFromSale(sale);
      return tokenId ? fetchTokenRecord(tokenId) : Promise.resolve(null);
    })
  );

  const items: MarketListingItem[] = [];
  for (let i = 0; i < nativeSales.length; i += 1) {
    const item = listingFromNativeSale(nativeSales[i]!, tokens[i] ?? null);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Active secondary (native NFT) fixed-price + auction listings.
 * Prefers indexer discovery + RPC hydrate; RPC dump if indexer is empty/down.
 */
export async function fetchNativeMarketListings(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketListingItem[]> {
  const limit = opts.limit ?? 40;
  try {
    const fromIndexer = await fetchNativeMarketListingsFromIndexer(limit);
    if (fromIndexer.length > 0) return fromIndexer;
  } catch {
    // Indexer/OnAPI unavailable — fall through to contract enumeration.
  }
  return fetchNativeMarketListingsFromRpc(limit);
}

/** Default “Yours” page — small enough to never stall the panel. */
export const OWNED_PAGE_SIZE = 24;
/** Cap so a huge vault doesn’t stall Market; newest pages still load first. */
const OWNED_MAX_TOKENS = 300;

/** One page of wallet-owned scarces for Market “Yours”. */
export interface OwnedScarcesPage {
  items: OwnedScarceItem[];
  /** Tokens consumed from the newest end; pass back as `fromEnd`. */
  nextFromEnd: number;
  hasMore: boolean;
}

type OwnedListedState = {
  kind: 'fixed' | 'auction';
  priceNear: string;
  bidCount?: number;
  expiresAtNs?: number | null;
};

async function fetchOwnerListedStates(
  owner: string
): Promise<Map<string, OwnedListedState>> {
  // Indexer active listings first — no get_sales_by_owner_id on the happy path.
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeListings({
      sellerId: owner,
      kinds: ['native', 'auction'],
      limit: 50,
    });
    const listedByToken = new Map<string, OwnedListedState>();
    for (const row of rows) {
      const tokenId = row.tokenId?.trim();
      if (!tokenId) continue;
      if (row.kind === 'native') {
        const priceNear = priceNearFromYocto(row.price);
        if (priceNear) listedByToken.set(tokenId, { kind: 'fixed', priceNear });
        continue;
      }
      if (row.kind === 'auction') {
        const displayYocto =
          row.highestBid &&
          /^\d+$/.test(row.highestBid) &&
          BigInt(row.highestBid) > 0n
            ? row.highestBid
            : row.price;
        const priceNear = priceNearFromYocto(displayYocto);
        if (!priceNear) continue;
        listedByToken.set(tokenId, {
          kind: 'auction',
          priceNear,
          ...(typeof row.bidCount === 'number' ? { bidCount: row.bidCount } : {}),
          ...(row.expiresAt != null ? { expiresAtNs: row.expiresAt } : {}),
        });
      }
    }
    return listedByToken;
  } catch {
    // Fall through to contract sales enumeration.
  }

  let ownerSales: ContractSaleRecord[] = [];
  try {
    ownerSales = await viewNearContract<ContractSaleRecord[]>(
      SCARCES_CONTRACT,
      'get_sales_by_owner_id',
      { account_id: owner, from_index: 0, limit: 50 }
    );
  } catch {
    ownerSales = [];
  }

  const listedByToken = new Map<string, OwnedListedState>();
  for (const sale of ownerSales) {
    const tokenId = nativeTokenIdFromSale(sale);
    if (!tokenId) continue;
    if (isFixedPriceNativeSale(sale)) {
      const priceNear = priceNearFromYocto(sale.sale_conditions);
      if (priceNear) listedByToken.set(tokenId, { kind: 'fixed', priceNear });
      continue;
    }
    if (isNativeAuctionSale(sale)) {
      const priceNear = auctionDisplayPriceNear(sale);
      if (priceNear) {
        listedByToken.set(tokenId, {
          kind: 'auction',
          priceNear,
          bidCount: auctionBidCount(sale),
          expiresAtNs: saleExpiresAtNs(sale),
        });
      }
    }
  }
  return listedByToken;
}

function ownedItemsFromTokens(
  tokens: ContractTokenRecord[],
  owner: string,
  listedByToken: Map<
    string,
    {
      kind: 'fixed' | 'auction';
      priceNear: string;
      bidCount?: number;
      expiresAtNs?: number | null;
    }
  >
): OwnedScarceItem[] {
  return tokens
    .map((token): OwnedScarceItem | null => {
      const tokenId = token.token_id?.trim();
      if (!tokenId) return null;
      const title =
        token.metadata?.title?.trim() ||
        (tokenId.includes(':') && !tokenId.startsWith('s:')
          ? tokenId
          : 'Scarce');
      const displayTitle = resolveTokenDisplayTitle(title, tokenId);
      const description = token.metadata?.description?.trim() || undefined;
      const extra = parseExtra(token.metadata?.extra ?? null);
      const sourcePostPath = sourcePostPathFromExtra(extra);
      const collectionId = collectionIdFromTokenId(tokenId);
      const mediumKind = mediumKindFromExtra(extra) ?? null;
      const playables = playablesFromExtra(extra);
      const discovery = discoveryFieldsFromExtra(extra, playables.length);
      const listed = listedByToken.get(tokenId);
      return {
        tokenId,
        title: displayTitle,
        ...(description && description !== displayTitle ? { description } : {}),
        mediaUrl: resolveScarceMediaUrl(token.metadata?.media ?? null),
        ownerId: token.owner_id?.trim() || owner,
        collectionId,
        mediumKind,
        ...discovery,
        listingKind: listed?.kind ?? null,
        listedPriceNear: listed?.priceNear ?? null,
        ...(listed?.kind === 'auction' && listed.bidCount != null
          ? { bidCount: listed.bidCount }
          : {}),
        ...(listed?.kind === 'auction' && listed.expiresAtNs != null
          ? { expiresAtNs: listed.expiresAtNs }
          : {}),
        ...(sourcePostPath ? { sourcePostPath } : {}),
      };
    })
    .filter((item): item is OwnedScarceItem => item != null);
}

/**
 * Load one owned scarce by token id (nft_token + owner sales). Used when the
 * Collectibles player deep-links with `?t=` so Sell targets the right edition.
 */
export async function fetchOwnedScarceByTokenId(
  accountId: string,
  tokenId: string
): Promise<OwnedScarceItem | null> {
  const owner = accountId.trim();
  const id = tokenId.trim();
  if (!owner || !id) return null;

  const token = await fetchTokenRecord(id);
  if (!token?.token_id?.trim()) return null;
  const tokenOwner = token.owner_id?.trim() || '';
  if (
    tokenOwner &&
    tokenOwner.toLowerCase() !== owner.toLowerCase()
  ) {
    return null;
  }

  const listedByToken = await fetchOwnerListedStates(owner);
  return ownedItemsFromTokens([token], owner, listedByToken)[0] ?? null;
}

/**
 * Find the viewer’s owned edition for a drop (newest pages first).
 * Fallback when the play URL has no `?t=` token id.
 */
export async function fetchOwnedScarceForCollection(
  accountId: string,
  collectionId: string
): Promise<OwnedScarceItem | null> {
  const owner = accountId.trim();
  const target = collectionId.trim();
  if (!owner || !target) return null;

  let fromEnd = 0;
  for (let i = 0; i < 8; i++) {
    const page = await fetchOwnedScarcesPage(owner, {
      fromEnd,
      pageSize: OWNED_PAGE_SIZE,
    });
    const hit = page.items.find((item) => {
      const id =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        '';
      return id === target;
    });
    if (hit) return hit;
    if (!page.hasMore) break;
    fromEnd = page.nextFromEnd;
  }
  return null;
}

/**
 * One newest-first page of scarces owned by `accountId`, with listed price
 * when already for sale. Indexer-first (`ownedBy` + batch
 * `collectionsCurrentByIds`); RPC `nft_tokens_for_owner` only on Hasura
 * failure. `hasMore` stops at `OWNED_MAX_TOKENS`.
 */
async function fetchOwnedScarcesPageFromIndexer(
  owner: string,
  fromEnd: number,
  pageSize: number
): Promise<OwnedScarcesPage | null> {
  const client = createReadOnlyOnSocialClient();
  const take = Math.min(pageSize, OWNED_MAX_TOKENS - fromEnd);
  if (take <= 0) {
    return { items: [], nextFromEnd: fromEnd, hasMore: false };
  }

  const page = await client.query.scarces.ownedBy(owner, {
    limit: take,
    offset: fromEnd,
  });
  const rows = page.items ?? [];
  const collectionIds = [
    ...new Set(
      rows
        .map(
          (row) =>
            row.collectionId?.trim() ||
            collectionIdFromTokenId(row.tokenId?.trim() || '')
        )
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const collectionById = new Map<
    string,
    Awaited<
      ReturnType<typeof client.query.scarces.collectionsCurrentByIds>
    >[number]
  >();
  if (collectionIds.length > 0) {
    try {
      const catalogRows =
        await client.query.scarces.collectionsCurrentByIds(collectionIds);
      for (const row of catalogRows) {
        const id = row.collectionId?.trim();
        if (id) collectionById.set(id, row);
      }
    } catch {
      // Thin vault without titles still paints; RPC path covers hard failure.
    }
  }

  const listedByToken = await fetchOwnerListedStates(owner);
  const items: OwnedScarceItem[] = [];
  for (const row of rows) {
    const tokenId = row.tokenId?.trim();
    if (!tokenId) continue;
    const collectionId =
      row.collectionId?.trim() || collectionIdFromTokenId(tokenId);
    const catalog = collectionId
      ? collectionById.get(collectionId) ?? null
      : null;
    const face = catalog
      ? displayFromOwnedCollectionCatalog(catalog, tokenId)
      : null;
    const extra = parseExtra(face?.extraJson ?? catalog?.extraJson ?? null);
    const playables = playablesFromExtra(extra);
    const discovery = discoveryFieldsFromExtra(extra, playables.length);
    const mediumKind =
      face?.kind ??
      mediumKindFromExtra(extra) ??
      (catalog?.kind?.trim() ? catalog.kind.trim() : null);
    const displayTitle =
      face?.title ||
      (tokenId.includes(':') && !tokenId.startsWith('s:')
        ? tokenId
        : 'Scarce');
    const description = face?.description;
    const listed = listedByToken.get(tokenId);
    items.push({
      tokenId,
      title: displayTitle,
      ...(description && description !== displayTitle ? { description } : {}),
      mediaUrl: face?.mediaUrl ?? null,
      ownerId: row.ownerId?.trim() || owner,
      collectionId,
      mediumKind,
      ...discovery,
      listingKind: listed?.kind ?? null,
      listedPriceNear: listed?.priceNear ?? null,
      ...(listed?.kind === 'auction' && listed.bidCount != null
        ? { bidCount: listed.bidCount }
        : {}),
      ...(listed?.kind === 'auction' && listed.expiresAtNs != null
        ? { expiresAtNs: listed.expiresAtNs }
        : {}),
      ...(sourcePostPathFromExtra(extra)
        ? { sourcePostPath: sourcePostPathFromExtra(extra)! }
        : {}),
    });
  }

  // Solo tokens / thin catalog rows — token metadata has the real title/art.
  const thinIndexes = items
    .map((item, index) => (ownedItemNeedsTokenMeta(item) ? index : -1))
    .filter((index) => index >= 0);
  if (thinIndexes.length > 0) {
    await Promise.all(
      thinIndexes.map(async (index) => {
        const item = items[index]!;
        const meta = await fetchScarceTokenMeta(item.tokenId);
        if (!meta) return;
        const nextTitle =
          meta.title?.trim() && meta.title.trim() !== item.tokenId
            ? resolveTokenDisplayTitle(meta.title.trim(), item.tokenId)
            : item.title;
        items[index] = {
          ...item,
          title: nextTitle,
          ...(meta.description && meta.description !== nextTitle
            ? { description: meta.description }
            : {}),
          mediaUrl: meta.mediaUrl ?? item.mediaUrl,
          ...(meta.sourcePostPath && !item.sourcePostPath
            ? { sourcePostPath: meta.sourcePostPath }
            : {}),
        };
      })
    );
  }

  const nextFromEnd = fromEnd + rows.length;
  return {
    items,
    nextFromEnd,
    hasMore:
      page.nextOffset != null && nextFromEnd < OWNED_MAX_TOKENS,
  };
}

async function fetchOwnedScarcesPageFromRpc(
  owner: string,
  fromEnd: number,
  pageSize: number
): Promise<OwnedScarcesPage> {
  const empty: OwnedScarcesPage = {
    items: [],
    nextFromEnd: fromEnd,
    hasMore: false,
  };

  let total = 0;
  try {
    const supply = await viewNearContract<string | number>(
      SCARCES_CONTRACT,
      'nft_supply_for_owner',
      { account_id: owner }
    );
    total = Math.floor(Number(supply));
  } catch {
    return empty;
  }
  if (!Number.isFinite(total) || total <= fromEnd) return empty;

  const take = Math.min(pageSize, total - fromEnd, OWNED_MAX_TOKENS - fromEnd);
  const fromIndex = total - fromEnd - take;

  let tokens: ContractTokenRecord[] = [];
  try {
    tokens = await viewNearContract<ContractTokenRecord[]>(
      SCARCES_CONTRACT,
      'nft_tokens_for_owner',
      { account_id: owner, from_index: String(fromIndex), limit: take }
    );
  } catch {
    return empty;
  }
  if (!Array.isArray(tokens)) return empty;

  // Oldest→newest within the slice; flip for Market “Yours”.
  tokens.reverse();

  const listedByToken = await fetchOwnerListedStates(owner);
  const nextFromEnd = fromEnd + take;
  return {
    items: ownedItemsFromTokens(tokens, owner, listedByToken),
    nextFromEnd,
    hasMore: nextFromEnd < Math.min(total, OWNED_MAX_TOKENS),
  };
}

export async function fetchOwnedScarcesPage(
  accountId: string,
  opts: { fromEnd?: number; pageSize?: number } = {}
): Promise<OwnedScarcesPage> {
  const owner = accountId.trim();
  const fromEnd = Math.max(0, opts.fromEnd ?? 0);
  const pageSize = Math.max(1, opts.pageSize ?? OWNED_PAGE_SIZE);
  const empty: OwnedScarcesPage = {
    items: [],
    nextFromEnd: fromEnd,
    hasMore: false,
  };
  if (!owner || fromEnd >= OWNED_MAX_TOKENS) return empty;

  try {
    const indexed = await fetchOwnedScarcesPageFromIndexer(
      owner,
      fromEnd,
      pageSize
    );
    if (indexed) return indexed;
  } catch {
    // Hasura / OnAPI unavailable — fall through to RPC.
  }

  return fetchOwnedScarcesPageFromRpc(owner, fromEnd, pageSize);
}

/**
 * Load one listing by id. Returns null when missing or when the view traps
 * (corrupt historical rows must not blank the whole Market).
 */
export async function fetchLazyListingById(
  listingId: string
): Promise<MarketListingItem | null> {
  try {
    const record = await viewNearContract<LazyListingRecord | null>(
      SCARCES_CONTRACT,
      'get_lazy_listing',
      { listing_id: listingId }
    );
    if (!record) return null;
    return listingFromRecord(listingId, record);
  } catch {
    return null;
  }
}

/** NEP-177 fields for sheet/feed hydrate when catalog omits description. */
export interface ScarceTokenMeta {
  title?: string;
  description?: string;
  mediaUrl?: string | null;
  sourcePostPath?: string;
  cardBg?: string;
  playable?: ScarcePlayableMedia;
  playables?: ScarcePlayableMedia[];
}

/** Load title / description / media from a minted token. */
export async function fetchScarceTokenMeta(
  tokenId: string
): Promise<ScarceTokenMeta | null> {
  const token = await fetchTokenRecord(tokenId);
  if (!token) return null;
  const title = token.metadata?.title?.trim() || undefined;
  const description = token.metadata?.description?.trim() || undefined;
  const mediaUrl = resolveScarceMediaUrl(token.metadata?.media ?? null);
  const extra = parseExtra(token.metadata?.extra ?? null);
  const theme = asRecord(extra?.theme ?? null);
  const cardBg = stringField(theme, 'bg');
  const sourcePostPath = sourcePostPathFromExtra(extra);
  const playables = playablesFromExtra(extra);
  const playable = playables[0];
  return {
    ...(title ? { title } : {}),
    ...(description && description !== title ? { description } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(sourcePostPath ? { sourcePostPath } : {}),
    ...(cardBg ? { cardBg } : {}),
    ...(playable ? { playable } : {}),
    ...(playables.length > 0 ? { playables } : {}),
  };
}

/**
 * Prefer live listing / token metadata for description + cover — catalog
 * browse rows omit description. RPC hydrate is sheet-open only.
 */
export async function fetchScarceListingMeta(opts: {
  listingId?: string | null;
  tokenId?: string | null;
}): Promise<ScarceTokenMeta | null> {
  const listingId = opts.listingId?.trim();
  if (listingId) {
    const live = await fetchLazyListingById(listingId);
    if (live) {
      return {
        ...(live.title ? { title: live.title } : {}),
        ...(live.description ? { description: live.description } : {}),
        ...(live.mediaUrl ? { mediaUrl: live.mediaUrl } : {}),
        ...(live.sourcePostPath ? { sourcePostPath: live.sourcePostPath } : {}),
        ...(live.cardBg ? { cardBg: live.cardBg } : {}),
        ...(live.playable ? { playable: live.playable } : {}),
        ...(live.playables?.length ? { playables: live.playables } : {}),
      };
    }
  }
  const tokenId = opts.tokenId?.trim();
  if (tokenId) return fetchScarceTokenMeta(tokenId);
  return null;
}

/**
 * Mint time from indexer `scarces_events` (first mint-family op, else earliest
 * token event). Detail sheets only — not browse rows.
 */
export async function fetchScarceMintedAt(
  tokenId: string
): Promise<number | null> {
  const id = tokenId.trim();
  if (!id) return null;
  try {
    const client = createReadOnlyOnSocialClient();
    const history = await client.query.scarces.tokenHistory(id, { limit: 40 });
    if (history.length === 0) return null;
    const mint =
      history.find((row) => SCARCE_MINT_OPS.has(row.operation)) ?? history[0];
    const ms = timestampMs(mint.blockTimestamp);
    return ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

const LIVE_LISTINGS_TTL_MS = 30_000;
const liveListingsCache = new Map<
  string,
  { at: number; promise: Promise<MarketListingItem[]> }
>();

/** Drop creator live-listing cache after cancel / re-list so hydrate is fresh. */
export function invalidateLiveListingsCache(creatorId?: string): void {
  if (!creatorId?.trim()) {
    liveListingsCache.clear();
    return;
  }
  liveListingsCache.delete(creatorId.trim().toLowerCase());
}

export async function fetchLiveListingsForCreator(
  creatorId: string
): Promise<MarketListingItem[]> {
  const key = creatorId.trim().toLowerCase();
  if (!key) return [];
  const hit = liveListingsCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_LISTINGS_TTL_MS) {
    return hit.promise;
  }

  // Indexer `scarces_active_listings` — same catalog as Market browse.
  // Never N× get_lazy_listing on feed hydrate; verify at buy/bid time only.
  const promise = (async (): Promise<MarketListingItem[]> => {
    try {
      const client = createReadOnlyOnSocialClient();
      const rows = await client.query.scarces.activeListings({
        sellerId: creatorId,
        kinds: ['lazy'],
        limit: 40,
      });
      const items = rows
        .map((row) => listingFromActiveRow(row))
        .filter((item): item is MarketListingItem => {
          if (!item || !isLiveLazyListing(item)) return false;
          return accountIdsEqualSafe(item.creatorId, creatorId);
        });
      return withResolvedPostHrefs(items);
    } catch {
      return [];
    }
  })();

  liveListingsCache.set(key, { at: Date.now(), promise });
  try {
    return await promise;
  } catch (error) {
    liveListingsCache.delete(key);
    throw error;
  }
}

function accountIdsEqualSafe(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Resolve a live lazy listing that points at a given source post. */
export async function findLiveListingForPost(
  creatorId: string,
  author: string,
  postId: string
): Promise<MarketListingItem | null> {
  const wantPath = `${author}/post/${postId}`;
  const items = await fetchLiveListingsForCreator(creatorId);
  const matches = items.filter((item) => item.sourcePostPath === wantPath);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.blockTimestamp - a.blockTimestamp);
  return matches[0] ?? null;
}

function listingFromActiveRow(
  row: ScarcesActiveListingRow
): MarketListingItem | null {
  const kind =
    row.kind === 'lazy' || row.kind === 'native' || row.kind === 'auction'
      ? row.kind
      : null;
  if (!kind) return null;
  const sellerId = row.sellerId?.trim() || row.creatorId?.trim();
  if (!sellerId) return null;

  const displayYocto =
    kind === 'auction'
      ? row.highestBid &&
        /^\d+$/.test(row.highestBid) &&
        BigInt(row.highestBid) > 0n
        ? row.highestBid
        : (row.reservePrice ?? row.price)
      : row.price;
  const priceNear = priceNearFromYocto(displayYocto) ?? '—';
  const title =
    row.title?.trim() ||
    (row.tokenId && row.tokenId.includes(':') && !row.tokenId.startsWith('s:')
      ? row.tokenId
      : 'Scarce');
  const blockTimestamp = timestampMs(row.listedBlockTimestamp);
  const copies =
    row.copies != null && Number.isFinite(row.copies) && row.copies > 0
      ? Math.floor(row.copies)
      : undefined;
  const remaining =
    row.remaining != null && Number.isFinite(row.remaining)
      ? Math.max(0, Math.floor(row.remaining))
      : undefined;
  if (kind === 'lazy' && remaining === 0) return null;

  const highest =
    row.highestBid && /^\d+$/.test(row.highestBid)
      ? BigInt(row.highestBid)
      : 0n;
  const priceLabel =
    kind === 'auction'
      ? highest > 0n
        ? ('High bid' as const)
        : ('Reserve' as const)
      : kind === 'native'
        ? ('Ask' as const)
        : undefined;

  const mediumKind = mediumKindFromExtraJson(row.extraJson);
  const extra = parseExtra(row.extraJson ?? null);
  const playableCount = playablesFromExtra(extra).length;
  const discovery = discoveryFieldsFromExtra(extra, playableCount);
  const sourcePostPath = row.sourcePostPath?.trim() || undefined;
  const artistId = artistIdDistinctFromSeller(
    sellerId,
    row.creatorId,
    authorFromSourcePostPath(sourcePostPath)
  );

  return {
    kind,
    ...(kind === 'lazy' && row.listingId?.trim()
      ? { listingId: row.listingId.trim() }
      : {}),
    ...(row.tokenId?.trim() ? { tokenId: row.tokenId.trim() } : {}),
    creatorId: sellerId,
    ...(artistId ? { artistId } : {}),
    title: resolveTokenDisplayTitle(title, row.tokenId?.trim() || ''),
    priceNear,
    ...(priceLabel ? { priceLabel } : {}),
    blockTimestamp,
    mediaUrl: resolveScarceMediaUrl(row.media),
    ...(sourcePostPath ? { sourcePostPath } : {}),
    ...(row.cardBg?.trim() ? { cardBg: row.cardBg.trim() } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...discovery,
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(kind === 'auction'
      ? {
          expiresAtNs:
            row.expiresAt != null && row.expiresAt > 0 ? row.expiresAt : null,
          bidCount: row.bidCount ?? 0,
          buyNowNear: priceNearFromYocto(row.buyNowPrice),
        }
      : row.expiresAt != null && row.expiresAt > 0
        ? { expiresAtNs: row.expiresAt }
        : {}),
  };
}

/**
 * Degraded browse: indexer event discovery + RPC hydrate.
 * Used only when OnAPI/Hasura catalog throws — not when the market is empty.
 */
async function fetchMarketListingsViaRpc(
  limit: number
): Promise<MarketListingItem[]> {
  const client = createReadOnlyOnSocialClient();
  const [createdResult, nativeResult] = await Promise.allSettled([
    client.query.scarces.events({
      eventType: 'LAZY_LISTING_UPDATE',
      operation: 'created',
      limit: Math.min(limit * 3, 120),
    }),
    fetchNativeMarketListings({ limit }),
  ]);
  const created =
    createdResult.status === 'fulfilled' ? createdResult.value : [];
  const nativeListings =
    nativeResult.status === 'fulfilled' ? nativeResult.value : [];

  const listingIds: string[] = [];
  const seenIds = new Set<string>();
  for (const row of created) {
    const listingId = row.listingId?.trim();
    if (!listingId || seenIds.has(listingId)) continue;
    seenIds.add(listingId);
    listingIds.push(listingId);
    if (listingIds.length >= limit * 2) break;
  }

  const loaded = await Promise.all(
    listingIds.map((id) => fetchLazyListingById(id))
  );

  const byKey = new Map<string, MarketListingItem>();
  for (const item of loaded) {
    if (!item?.listingId || !isLiveLazyListing(item)) continue;
    byKey.set(marketListingRowKey(item), item);
  }
  for (const item of nativeListings) {
    byKey.set(marketListingRowKey(item), item);
  }

  return [...byKey.values()]
    .sort((a, b) => b.blockTimestamp - a.blockTimestamp)
    .slice(0, limit);
}

/** One Market catalog page for infinite scroll. */
export interface MarketListingsPage {
  items: MarketListingItem[];
  /** Pass back as `offset` to fetch the next page. */
  nextOffset: number;
  hasMore: boolean;
}

function sortToIndexerOrder(
  sort: MarketListingSort | undefined
): 'listed_desc' | 'price_asc' | 'price_desc' | 'ending_asc' {
  if (sort === 'price-asc') return 'price_asc';
  if (sort === 'price-desc') return 'price_desc';
  if (sort === 'ending') return 'ending_asc';
  return 'listed_desc';
}

/**
 * Active Market catalog via sink `scarces_active_listings` (OnAPI), paged.
 * Filter / sort / search run in the indexer so pages stay globally correct.
 * Empty catalog → empty UI. RPC degrade only on true query failure, and only
 * for the first page. Buy/bid/verify still use contract views at action time.
 */
export async function fetchMarketListings(
  opts: {
    limit?: number;
    offset?: number;
    kinds?: ('lazy' | 'native' | 'auction')[];
    search?: string;
    sort?: MarketListingSort;
    /** Restrict to one creator / seller (creator Store deep-link). */
    sellerId?: string;
    /** Restrict to one app / store slug. */
    appId?: string;
    /** Server/browser client; defaults to the browser gateway proxy. */
    client?: OnSocial;
  } = {}
): Promise<MarketListingsPage> {
  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  try {
    const client = opts.client ?? createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeListings({
      limit,
      offset,
      ...(opts.kinds?.length ? { kinds: opts.kinds } : {}),
      ...(opts.search?.trim() ? { search: opts.search.trim() } : {}),
      ...(opts.sellerId?.trim() ? { sellerId: opts.sellerId.trim() } : {}),
      ...(opts.appId?.trim() ? { appId: opts.appId.trim() } : {}),
      orderBy: sortToIndexerOrder(opts.sort),
    });
    const items = rows
      .map((row) => listingFromActiveRow(row))
      .filter((item): item is MarketListingItem => item != null);
    return {
      items: await withResolvedPostHrefs(items),
      // Advance by raw row count so client-dropped rows don't re-fetch.
      nextOffset: offset + rows.length,
      hasMore: rows.length === limit,
    };
  } catch {
    // Catalog missing / Hasura unavailable — degrade to RPC hydrate.
    if (offset > 0) return { items: [], nextOffset: offset, hasMore: false };
    // RPC-hydrated rows carry no app_id — can't honor an app filter, so skip
    // the fallback rather than show unrelated listings.
    if (opts.appId?.trim()) return { items: [], nextOffset: 0, hasMore: false };
    const fallbackAll = await fetchMarketListingsViaRpc(limit);
    const seller = opts.sellerId?.trim();
    const fallback = seller
      ? fallbackAll.filter((item) =>
          accountIdsEqualSafe(item.creatorId, seller)
        )
      : fallbackAll;
    return {
      items: await withResolvedPostHrefs(fallback),
      nextOffset: fallback.length,
      hasMore: false,
    };
  }
}

/**
 * Recent sales from indexer events (`os.query.scarces.recentSales`).
 * RPC token hydrate only when event extra lacks title/media/source path.
 */
export async function fetchMarketSales(
  opts: {
    limit?: number;
    /** Server/browser client; defaults to the browser gateway proxy. */
    client?: OnSocial;
  } = {}
): Promise<MarketSaleItem[]> {
  const limit = opts.limit ?? 20;
  const client = opts.client ?? createReadOnlyOnSocialClient();
  let merged: ScarcesEventRow[] = [];
  try {
    merged = await client.query.scarces.recentSales({ limit });
  } catch {
    // Fall back to dual event queries if recentSales is unavailable.
    const [lazyResult, nativeResult] = await Promise.allSettled([
      client.query.scarces.events({
        eventType: 'LAZY_LISTING_UPDATE',
        operation: 'purchased',
        limit,
      }),
      client.query.scarces.events({
        eventType: 'SCARCE_UPDATE',
        operation: ['purchase', 'auction_settled'],
        limit,
      }),
    ]);
    const lazyPurchased =
      lazyResult.status === 'fulfilled' ? lazyResult.value : [];
    const nativeSales =
      nativeResult.status === 'fulfilled' ? nativeResult.value : [];
    merged = [...lazyPurchased, ...nativeSales].sort(
      (a, b) => b.blockTimestamp - a.blockTimestamp
    );
  }

  const items = merged.slice(0, limit).map((row) => {
    const mediaUrl = saleMediaFromRow(row);
    const sourcePostPath = saleSourcePostFromRow(row);
    return {
      listingId: row.listingId?.trim() || undefined,
      tokenId: row.tokenId?.trim() || undefined,
      buyerId: accountFromRow(row.buyerId),
      sellerId: accountFromRow(row.sellerId),
      creatorId: accountFromRow(row.creatorId, row.author),
      title: saleTitle(row),
      priceNear: priceNearFromRow(row),
      blockTimestamp: row.blockTimestamp,
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(sourcePostPath ? { sourcePostPath } : {}),
    };
  });

  const tokenIdsNeedingMeta = [
    ...new Set(
      items
        .filter((item) => {
          if (!item.tokenId?.trim()) return false;
          const needsTitle =
            item.title === 'Scarce' || hasUnresolvedTitleTemplate(item.title);
          return needsTitle || !item.mediaUrl || !item.sourcePostPath;
        })
        .map((item) => item.tokenId!.trim())
    ),
  ];
  const tokenMeta = new Map(
    await Promise.all(
      tokenIdsNeedingMeta.map(
        async (tokenId) => [tokenId, await fetchTokenRecord(tokenId)] as const
      )
    )
  );

  const enriched = items.map((item) => {
    const token = item.tokenId ? tokenMeta.get(item.tokenId) : null;
    if (!token) return item;
    const tokenTitle = token.metadata?.title?.trim();
    const extra = parseExtra(token.metadata?.extra ?? null);
    const mediaFromToken = token.metadata?.media
      ? resolveScarceMediaUrl(token.metadata.media)
      : null;
    const sourceFromToken = sourcePostPathFromExtra(extra);
    return {
      ...item,
      ...(tokenTitle &&
      (item.title === 'Scarce' || hasUnresolvedTitleTemplate(item.title))
        ? { title: resolveTokenDisplayTitle(tokenTitle, item.tokenId!) }
        : {}),
      ...(!item.mediaUrl && mediaFromToken ? { mediaUrl: mediaFromToken } : {}),
      ...(!item.sourcePostPath && sourceFromToken
        ? { sourcePostPath: sourceFromToken }
        : {}),
    };
  });

  return withResolvedSalePostHrefs(enriched);
}
