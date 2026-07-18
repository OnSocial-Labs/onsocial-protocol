import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
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
    extra?: string | null;
  };
  price?: string | { '0'?: string } | null;
  created_at?: number;
}

export interface MarketListingItem {
  listingId: string;
  creatorId: string;
  title: string;
  priceNear: string;
  blockTimestamp: number;
  mediaUrl?: string | null;
  sourcePostPath?: string;
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
      : raw && typeof raw === 'object' && typeof (raw as { '0'?: string })['0'] === 'string'
        ? (raw as { '0': string })['0']
        : null;
  if (!priceYocto || !/^\d+$/.test(priceYocto)) return null;
  return yoctoToNear(priceYocto);
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

function saleTitle(row: ScarcesEventRow): string {
  const extra = parseExtra(row.extraData);
  const titled =
    stringField(extra, 'title') ?? stringField(extra, 'name') ?? null;
  if (titled) return titled;
  const tokenId = row.tokenId?.trim();
  if (!tokenId) return 'Scarce';
  // Collection-style ids already read as names; keep short native ids readable.
  if (tokenId.includes(':') && !tokenId.startsWith('s:')) return tokenId;
  return `Scarce ${tokenId}`;
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
  const createdAt = Number(record.created_at) || 0;
  // Contract timestamps are ns; feed/indexer use ms-ish seconds — normalize to ms for sort.
  const blockTimestamp =
    createdAt > 1e15 ? Math.floor(createdAt / 1e6) : createdAt;

  return {
    listingId,
    creatorId,
    title,
    priceNear,
    blockTimestamp,
    mediaUrl,
    sourcePostPath: sourcePostPathFromExtra(extra),
  };
}

export async function fetchLiveListingsForCreator(
  creatorId: string
): Promise<MarketListingItem[]> {
  try {
    const rows = await viewNearContract<Array<[string, LazyListingRecord]>>(
      SCARCES_CONTRACT,
      'get_lazy_listings_by_creator',
      { creator_id: creatorId, from_index: 0, limit: 20 }
    );
    if (!Array.isArray(rows)) return [];
    const items: MarketListingItem[] = [];
    for (const entry of rows) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [listingId, record] = entry;
      if (typeof listingId !== 'string' || !record) continue;
      const item = listingFromRecord(listingId, record);
      if (item) items.push(item);
    }
    return items;
  } catch {
    return [];
  }
}

/** Resolve a live lazy listing that points at a given source post. */
export async function findLiveListingForPost(
  creatorId: string,
  author: string,
  postId: string
): Promise<MarketListingItem | null> {
  const wantPath = `${author}/post/${postId}`;
  const items = await fetchLiveListingsForCreator(creatorId);
  const matches = items.filter(
    (item) => item.sourcePostPath === wantPath
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.blockTimestamp - a.blockTimestamp);
  return matches[0] ?? null;
}

/**
 * Active listings from live contract state.
 * Indexer `created` events only discover recent creators — ghosts (cancelled /
 * purchased) are never shown because we read `get_lazy_listings_by_creator`.
 */
export async function fetchMarketListings(opts: {
  limit?: number;
} = {}): Promise<MarketListingItem[]> {
  const limit = opts.limit ?? 40;
  const client = createReadOnlyOnSocialClient();
  const created = await client.query.scarces.events({
    eventType: 'LAZY_LISTING_UPDATE',
    operation: 'created',
    limit: Math.min(limit * 3, 120),
  });

  const creators: string[] = [];
  const seenCreators = new Set<string>();
  for (const row of created) {
    const creatorId = accountFromRow(row.creatorId, row.author);
    if (!creatorId || seenCreators.has(creatorId)) continue;
    seenCreators.add(creatorId);
    creators.push(creatorId);
    if (creators.length >= 24) break;
  }

  const batches = await Promise.all(
    creators.map((creatorId) => fetchLiveListingsForCreator(creatorId))
  );

  const byId = new Map<string, MarketListingItem>();
  for (const batch of batches) {
    for (const item of batch) {
      byId.set(item.listingId, item);
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.blockTimestamp - a.blockTimestamp)
    .slice(0, limit);
}

export async function fetchMarketSales(opts: {
  limit?: number;
} = {}): Promise<MarketSaleItem[]> {
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

  return merged.slice(0, limit).map((row) => ({
    listingId: row.listingId?.trim() || undefined,
    tokenId: row.tokenId?.trim() || undefined,
    buyerId: accountFromRow(row.buyerId),
    sellerId: accountFromRow(row.sellerId),
    creatorId: accountFromRow(row.creatorId, row.author),
    title: saleTitle(row),
    priceNear: priceNearFromRow(row),
    blockTimestamp: row.blockTimestamp,
  }));
}
