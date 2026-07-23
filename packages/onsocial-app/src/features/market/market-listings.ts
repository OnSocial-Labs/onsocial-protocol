import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { resolvePostThreadHrefFromSourcePath } from '@/lib/post-routes';
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
}

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
export function resolveTokenDisplayTitle(title: string, tokenId: string): string {
  if (!hasUnresolvedTitleTemplate(title)) return title;
  const edition = tokenId.includes(':') ? tokenId.split(':').at(-1) : tokenId;
  return title.replace(/#\{id\}/gi, `#${edition}`).replace(/\{token_id\}/gi, tokenId);
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

async function withResolvedPostHref(
  item: MarketListingItem
): Promise<MarketListingItem> {
  if (item.postHref || !item.sourcePostPath) return item;
  const postHref = await resolvePostThreadHrefFromSourcePath(
    item.sourcePostPath
  );
  return postHref ? { ...item, postHref } : item;
}

async function withResolvedPostHrefs(
  items: MarketListingItem[]
): Promise<MarketListingItem[]> {
  return Promise.all(items.map((item) => withResolvedPostHref(item)));
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
  };
}

/**
 * Active secondary (native NFT) fixed-price + auction listings from contract state.
 */
export async function fetchNativeMarketListings(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketListingItem[]> {
  const limit = opts.limit ?? 40;
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
 * Scarces owned by `accountId`, with optional listed price when already for sale.
 */
export async function fetchOwnedScarces(
  accountId: string
): Promise<OwnedScarceItem[]> {
  const owner = accountId.trim();
  if (!owner) return [];

  let tokens: ContractTokenRecord[] = [];
  try {
    tokens = await viewNearContract<ContractTokenRecord[]>(
      SCARCES_CONTRACT,
      'nft_tokens_for_owner',
      {
        account_id: owner,
        from_index: '0',
        limit: 50,
      }
    );
  } catch {
    return [];
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

  const listedByToken = new Map<
    string,
    { kind: 'fixed' | 'auction'; priceNear: string }
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
      if (priceNear) listedByToken.set(tokenId, { kind: 'auction', priceNear });
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
      return {
        tokenId,
        title,
        mediaUrl: resolveScarceMediaUrl(token.metadata?.media ?? null),
        ownerId: token.owner_id?.trim() || owner,
        listingKind: listedByToken.get(tokenId)?.kind ?? null,
        listedPriceNear: listedByToken.get(tokenId)?.priceNear ?? null,
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
      if (!item) return false;
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

/**
 * Active listings from live contract state (primary lazy + secondary native).
 * Indexer `created` events discover lazy ids; each id is loaded with
 * `get_lazy_listing` so one corrupt row cannot empty the Market.
 */
export async function fetchMarketListings(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketListingItem[]> {
  const limit = opts.limit ?? 40;
  const client = createReadOnlyOnSocialClient();
  const [created, nativeListings] = await Promise.all([
    client.query.scarces.events({
      eventType: 'LAZY_LISTING_UPDATE',
      operation: 'created',
      limit: Math.min(limit * 3, 120),
    }),
    fetchNativeMarketListings({ limit }),
  ]);

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
    if (!item?.listingId) continue;
    byKey.set(marketListingRowKey(item), item);
  }
  for (const item of nativeListings) {
    byKey.set(marketListingRowKey(item), item);
  }

  const sorted = [...byKey.values()]
    .sort((a, b) => b.blockTimestamp - a.blockTimestamp)
    .slice(0, limit);
  return withResolvedPostHrefs(sorted);
}

export async function fetchMarketSales(
  opts: {
    limit?: number;
  } = {}
): Promise<MarketSaleItem[]> {
  const limit = opts.limit ?? 20;
  const client = createReadOnlyOnSocialClient();
  const [lazyPurchased, nativeSales] = await Promise.all([
    client.query.scarces.events({
      eventType: 'LAZY_LISTING_UPDATE',
      operation: 'purchased',
      limit,
    }),
    client.query.scarces.sales({ limit }),
  ]);

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

  return Promise.all(
    enriched.map(async (item) => {
      if (!item.sourcePostPath) return item;
      const postHref = await resolvePostThreadHrefFromSourcePath(
        item.sourcePostPath
      );
      return postHref ? { ...item, postHref } : item;
    })
  );
}
