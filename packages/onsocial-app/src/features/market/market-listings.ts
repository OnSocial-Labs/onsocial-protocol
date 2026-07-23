import type { ScarcesActiveListingRow } from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { resolvePostThreadHrefsFromSourcePaths } from '@/lib/post-routes';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Minimal event shape used by Market browse (matches SDK scarces event rows). */
interface ScarcesEventRow {
  listingId: string | null;
  tokenId: string | null;
  creatorId: string | null;
  author: string;
  buyerId: string | null;
  sellerId: string | null;
  price: string | null;
  amount: string | null;
  extraData: string | null;
  blockTimestamp: number;
}

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

export interface MarketListingItem {
  /** Primary mint-on-purchase, secondary resale, or native auction. */
  kind: 'lazy' | 'native' | 'auction';
  /** Lazy listing id (`ll:…`). */
  listingId?: string;
  /** Native token id (`s:…`) for secondary listings / auctions. */
  tokenId?: string;
  /** Seller: creator for lazy, current owner for native/auction. */
  creatorId: string;
  title: string;
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
  mediaUrl?: string | null;
  ownerId: string;
  /** Listing state for an owned native scarce. */
  listingKind: 'fixed' | 'auction' | null;
  /** Set when this token is already listed for resale or auction. */
  listedPriceNear?: string | null;
  /** Auction bids on the current listing — cancel is blocked when > 0. */
  bidCount?: number;
  /** Original post path from token `metadata.extra` when present. */
  sourcePostPath?: string;
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

export function saleTitle(row: ScarcesEventRow): string {
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
  const priceNear = priceNearFromYocto(record.price) ?? '—';
  const mediaUrl = resolveScarceMediaUrl(record.metadata?.media ?? null);
  const extra = parseExtra(record.metadata?.extra ?? null);
  const theme = asRecord(extra?.theme ?? null);
  const cardBg = stringField(theme, 'bg');
  const createdAt = Number(record.created_at) || 0;
  // Contract timestamps are ns; feed/indexer use ms-ish seconds — normalize to ms for sort.
  const blockTimestamp =
    createdAt > 1e15 ? Math.floor(createdAt / 1e6) : createdAt;
  const copiesSafe = parseCount(record.metadata?.copies);
  const copies = copiesSafe != null && copiesSafe > 0 ? copiesSafe : undefined;
  const remaining = remainingForListing(record, copies);

  return {
    kind: 'lazy',
    listingId,
    creatorId,
    title,
    priceNear,
    blockTimestamp,
    mediaUrl,
    sourcePostPath: sourcePostPathFromExtra(extra),
    ...(cardBg ? { cardBg } : {}),
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
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
    return copy.sort((a, b) => {
      const aMs = auctionExpiresAtMs(a.expiresAtNs);
      const bMs = auctionExpiresAtMs(b.expiresAtNs);
      const aLive = a.kind === 'auction' && aMs != null;
      const bLive = b.kind === 'auction' && bMs != null;
      if (aLive && bLive) return aMs! - bMs!;
      if (aLive !== bLive) return aLive ? -1 : 1;
      const aAuction = a.kind === 'auction';
      const bAuction = b.kind === 'auction';
      if (aAuction !== bAuction) return aAuction ? -1 : 1;
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
  const mediaUrl = resolveScarceMediaUrl(token?.metadata?.media ?? null);
  const extra = parseExtra(token?.metadata?.extra ?? null);
  return {
    kind: isAuction ? 'auction' : 'native',
    tokenId,
    creatorId: sellerId,
    title,
    priceNear,
    priceLabel: isAuction ? auctionPriceLabel(sale) : 'Ask',
    blockTimestamp: timestampMs(sale.created_at),
    mediaUrl,
    sourcePostPath: sourcePostPathFromExtra(extra),
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

const OWNED_PAGE_SIZE = 50;
/** Cap so a huge vault doesn’t stall Market; newest pages still load first. */
const OWNED_MAX_TOKENS = 300;

async function fetchOwnedTokenPages(
  owner: string
): Promise<ContractTokenRecord[]> {
  const tokens: ContractTokenRecord[] = [];
  let fromIndex = 0;
  while (tokens.length < OWNED_MAX_TOKENS) {
    const page = await viewNearContract<ContractTokenRecord[]>(
      SCARCES_CONTRACT,
      'nft_tokens_for_owner',
      {
        account_id: owner,
        from_index: String(fromIndex),
        limit: OWNED_PAGE_SIZE,
      }
    );
    if (!Array.isArray(page) || page.length === 0) break;
    tokens.push(...page);
    if (page.length < OWNED_PAGE_SIZE) break;
    fromIndex += page.length;
  }
  return tokens;
}

/**
 * Scarces owned by `accountId`, with optional listed price when already for sale.
 * Newest first so recent wins/buys show under Yours without scrolling forever.
 */
export async function fetchOwnedScarces(
  accountId: string
): Promise<OwnedScarceItem[]> {
  const owner = accountId.trim();
  if (!owner) return [];

  let tokens: ContractTokenRecord[] = [];
  try {
    tokens = await fetchOwnedTokenPages(owner);
  } catch {
    return [];
  }

  // Contract enumeration is oldest→newest; flip for Market “Yours”.
  tokens.reverse();

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

  const listedByToken = new Map<
    string,
    { kind: 'fixed' | 'auction'; priceNear: string; bidCount?: number }
  >();
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
        });
      }
    }
  }

  return tokens
    .map((token): OwnedScarceItem | null => {
      const tokenId = token.token_id?.trim();
      if (!tokenId) return null;
      const title =
        token.metadata?.title?.trim() ||
        (tokenId.includes(':') && !tokenId.startsWith('s:')
          ? tokenId
          : 'Scarce');
      const extra = parseExtra(token.metadata?.extra ?? null);
      const sourcePostPath = sourcePostPathFromExtra(extra);
      const listed = listedByToken.get(tokenId);
      return {
        tokenId,
        title: resolveTokenDisplayTitle(title, tokenId),
        mediaUrl: resolveScarceMediaUrl(token.metadata?.media ?? null),
        ownerId: token.owner_id?.trim() || owner,
        listingKind: listed?.kind ?? null,
        listedPriceNear: listed?.priceNear ?? null,
        ...(listed?.kind === 'auction' && listed.bidCount != null
          ? { bidCount: listed.bidCount }
          : {}),
        ...(sourcePostPath ? { sourcePostPath } : {}),
      };
    })
    .filter((item): item is OwnedScarceItem => item != null);
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

export async function fetchLiveListingsForCreator(
  creatorId: string
): Promise<MarketListingItem[]> {
  // Prefer per-id loads from indexer discovery. Full-map views
  // (`get_lazy_listings_by_creator`) currently trap if any sibling row is
  // corrupt, which would hide healthy listings for every creator.
  try {
    const client = createReadOnlyOnSocialClient();
    const created = await client.query.scarces.events({
      eventType: 'LAZY_LISTING_UPDATE',
      operation: 'created',
      author: creatorId,
      limit: 40,
    });
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of created) {
      const listingId = row.listingId?.trim();
      if (!listingId || seen.has(listingId)) continue;
      seen.add(listingId);
      ids.push(listingId);
    }
    const loaded = await Promise.all(ids.map((id) => fetchLazyListingById(id)));
    const items = loaded.filter((item): item is MarketListingItem => {
      if (!item || !isLiveLazyListing(item)) return false;
      return accountIdsEqualSafe(item.creatorId, creatorId);
    });
    return withResolvedPostHrefs(items);
  } catch {
    return [];
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

  return {
    kind,
    ...(kind === 'lazy' && row.listingId?.trim()
      ? { listingId: row.listingId.trim() }
      : {}),
    ...(row.tokenId?.trim() ? { tokenId: row.tokenId.trim() } : {}),
    creatorId: sellerId,
    title: resolveTokenDisplayTitle(title, row.tokenId?.trim() || ''),
    priceNear,
    ...(priceLabel ? { priceLabel } : {}),
    blockTimestamp,
    mediaUrl: resolveScarceMediaUrl(row.media),
    ...(row.sourcePostPath?.trim()
      ? { sourcePostPath: row.sourcePostPath.trim() }
      : {}),
    ...(row.cardBg?.trim() ? { cardBg: row.cardBg.trim() } : {}),
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
 * Degraded browse: indexer event discovery + RPC hydrate (pre-catalog path).
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

/**
 * Active Market catalog — prefers sink `scarces_active_listings`, falls back
 * to event discovery + RPC hydrate when the catalog is empty/unavailable.
 * Buy/bid/verify still use contract views at action time.
 */
export async function fetchMarketListings(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketListingItem[]> {
  const limit = opts.limit ?? 40;
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeListings({ limit });
    const items = rows
      .map((row) => listingFromActiveRow(row))
      .filter((item): item is MarketListingItem => item != null);
    if (items.length > 0) {
      return withResolvedPostHrefs(items.slice(0, limit));
    }
  } catch {
    // Catalog missing / Hasura not tracked yet — degrade to RPC hydrate.
  }

  const fallback = await fetchMarketListingsViaRpc(limit);
  return withResolvedPostHrefs(fallback);
}

export async function fetchMarketSales(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketSaleItem[]> {
  const limit = opts.limit ?? 20;
  const client = createReadOnlyOnSocialClient();
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

  const merged = [...lazyPurchased, ...nativeSales].sort(
    (a, b) => b.blockTimestamp - a.blockTimestamp
  );

  const items = merged.slice(0, limit).map((row) => ({
    listingId: row.listingId?.trim() || undefined,
    tokenId: row.tokenId?.trim() || undefined,
    buyerId: accountFromRow(row.buyerId),
    sellerId: accountFromRow(row.sellerId),
    creatorId: accountFromRow(row.creatorId, row.author),
    title: saleTitle(row),
    priceNear: priceNearFromRow(row),
    blockTimestamp: row.blockTimestamp,
  }));
  const tokenIds = [
    ...new Set(
      items
        .map((item) => item.tokenId?.trim())
        .filter((tokenId): tokenId is string => Boolean(tokenId))
    ),
  ];
  const tokenMeta = new Map(
    await Promise.all(
      tokenIds.map(
        async (tokenId) => [tokenId, await fetchTokenRecord(tokenId)] as const
      )
    )
  );

  const enriched = items.map((item) => {
    const token = item.tokenId ? tokenMeta.get(item.tokenId) : null;
    const tokenTitle = token?.metadata?.title?.trim();
    const extra = parseExtra(token?.metadata?.extra ?? null);
    return {
      ...item,
      ...(tokenTitle &&
      (item.title === 'Scarce' || hasUnresolvedTitleTemplate(item.title))
        ? { title: resolveTokenDisplayTitle(tokenTitle, item.tokenId!) }
        : {}),
      ...(token?.metadata?.media
        ? { mediaUrl: resolveScarceMediaUrl(token.metadata.media) }
        : {}),
      ...(sourcePostPathFromExtra(extra)
        ? { sourcePostPath: sourcePostPathFromExtra(extra) }
        : {}),
    };
  });

  return withResolvedSalePostHrefs(enriched);
}
