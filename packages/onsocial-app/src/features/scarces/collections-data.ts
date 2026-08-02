import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';

/**
 * Collection (drop) reads for Phase 2 — supply-capped, optionally timed /
 * allowlisted edition sets minted on purchase. Indexer covers activity
 * (`os.query.scarces.collection`); the live record is read from the contract
 * so supply / price / schedule are always current.
 */

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Raw on-chain `LazyCollection` fields this app reads. */
interface LazyCollectionRecord {
  creator_id?: string;
  collection_id?: string;
  total_supply?: number;
  minted_count?: number;
  metadata_template?: string;
  price_near?: string | { '0'?: string } | null;
  allowlist_price?: string | { '0'?: string } | null;
  start_time?: number | null;
  end_time?: number | null;
  created_at?: number | null;
  max_per_wallet?: number | null;
  mint_mode?: string | null;
  paused?: boolean;
  cancelled?: boolean;
  banned?: boolean;
  app_id?: string | null;
  transferable?: boolean;
  renewable?: boolean;
  max_redeems?: number | null;
  metadata?: string | null;
}

export type CollectionStatus =
  | 'upcoming'
  | 'live'
  | 'sold_out'
  | 'ended'
  | 'paused'
  | 'cancelled';

export interface CollectionView {
  collectionId: string;
  creatorId: string;
  title: string;
  description?: string;
  mediaUrl: string | null;
  /** Display price per edition in NEAR (localized), or null when free. */
  priceNear: string | null;
  /** Ask per edition in yoctoNEAR (buy deposit), '0' when free. */
  priceYocto: string;
  totalSupply: number;
  minted: number;
  remaining: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  createdAtMs: number;
  maxPerWallet: number | null;
  mintMode: string;
  paused: boolean;
  cancelled: boolean;
  soldOut: boolean;
  allowlistOnly: boolean;
  appId: string | null;
  /** Medium taxonomy from metadata.extra.kind when set. */
  kind: string | null;
  transferable: boolean;
  renewable: boolean;
  maxRedeems: number | null;
  /** True when every token resolves its own artwork (media has a seat placeholder). */
  isVariations: boolean;
  /** Series grouping (from collection metadata `series`), when set. */
  seriesId: string | null;
  seriesTitle: string | null;
  sourcePostPath?: string;
  cardBg?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function yoctoString(raw: unknown): string {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const nested = (raw as { '0'?: string })['0'];
    if (typeof nested === 'string' && /^\d+$/.test(nested)) return nested;
  }
  return '0';
}

function priceDisplay(yocto: string): string | null {
  if (yocto === '0') return null;
  const near = yoctoToNear(yocto);
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function nsToMs(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e15 ? Math.floor(raw / 1e6) : raw > 1e12 ? raw : raw * 1000;
}

interface TemplateMeta {
  title: string;
  description?: string;
  mediaUrl: string | null;
  isVariations: boolean;
  sourcePostPath?: string;
  cardBg?: string;
  kind?: string;
}

const VARIATION_PLACEHOLDER = /\{(seat_number|index|token_id)\}/;

/** Cover art for a variation drop: the template media resolved for seat 1. */
function substituteFirstSeat(media: string, collectionId: string): string {
  return media
    .replace(/\{seat_number\}/g, '1')
    .replace(/\{index\}/g, '0')
    .replace(/\{token_id\}/g, `${collectionId}:1`);
}

/** Drop-level display title: strip per-token placeholders from the template title. */
function stripTitlePlaceholders(title: string): string {
  return title
    .replace(/\s*#\{seat_number\}/g, '')
    .replace(/\s*\{(seat_number|index|token_id)\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface SeriesMeta {
  id: string;
  title: string | null;
}

/** Parse `series` from the collection's freeform metadata blob. */
function parseSeries(
  metadataJson: string | null | undefined
): SeriesMeta | null {
  if (!metadataJson?.trim()) return null;
  try {
    const meta = asRecord(JSON.parse(metadataJson));
    const raw = meta?.series;
    if (typeof raw === 'string' && raw.trim()) {
      return { id: raw.trim(), title: null };
    }
    const nested = asRecord(raw);
    const id = typeof nested?.id === 'string' ? nested.id.trim() : '';
    if (!id) return null;
    const title =
      typeof nested?.title === 'string' && nested.title.trim()
        ? nested.title.trim()
        : null;
    return { id, title };
  } catch {
    return null;
  }
}

function parseTemplate(
  template: string | undefined,
  collectionId: string
): TemplateMeta {
  const fallback: TemplateMeta = {
    title: collectionId,
    mediaUrl: null,
    isVariations: false,
  };
  if (!template) return fallback;
  try {
    const meta = JSON.parse(template) as Record<string, unknown>;
    const rawTitle =
      typeof meta.title === 'string' && meta.title.trim()
        ? meta.title.trim()
        : collectionId;
    const description =
      typeof meta.description === 'string' && meta.description.trim()
        ? meta.description.trim()
        : undefined;
    const rawMedia = typeof meta.media === 'string' ? meta.media : null;
    const isVariations =
      rawMedia != null && VARIATION_PLACEHOLDER.test(rawMedia);
    const title = isVariations
      ? stripTitlePlaceholders(rawTitle) || collectionId
      : rawTitle;
    const mediaUrl = resolveScarceMediaUrl(
      rawMedia && isVariations
        ? substituteFirstSeat(rawMedia, collectionId)
        : rawMedia
    );
    let sourcePostPath: string | undefined;
    let cardBg: string | undefined;
    let kind: string | undefined;
    if (typeof meta.extra === 'string' && meta.extra.trim()) {
      try {
        const extra = asRecord(JSON.parse(meta.extra));
        const nested = asRecord(extra?.sourcePost);
        const path =
          (typeof nested?.path === 'string' && nested.path.trim()) || '';
        if (path) sourcePostPath = path;
        const theme = asRecord(extra?.theme);
        if (typeof theme?.bg === 'string' && theme.bg.trim()) {
          cardBg = theme.bg.trim();
        }
        if (typeof extra?.kind === 'string' && extra.kind.trim()) {
          kind = extra.kind.trim().toLowerCase();
        }
      } catch {
        // ignore malformed extra
      }
    }
    return {
      title,
      ...(description ? { description } : {}),
      mediaUrl,
      isVariations,
      ...(sourcePostPath ? { sourcePostPath } : {}),
      ...(cardBg ? { cardBg } : {}),
      ...(kind ? { kind } : {}),
    };
  } catch {
    return fallback;
  }
}

function toCollectionView(record: LazyCollectionRecord): CollectionView | null {
  const collectionId = record.collection_id?.trim();
  const creatorId = record.creator_id?.trim();
  if (!collectionId || !creatorId) return null;
  if (record.banned) return null;

  const totalSupply = Math.max(0, Math.floor(Number(record.total_supply) || 0));
  const minted = Math.max(0, Math.floor(Number(record.minted_count) || 0));
  const remaining = Math.max(0, totalSupply - minted);
  const priceYocto = yoctoString(record.price_near);
  const allowlistYocto = yoctoString(record.allowlist_price);
  const template = parseTemplate(record.metadata_template, collectionId);
  const series = parseSeries(record.metadata);
  const maxRedeems =
    record.max_redeems != null && record.max_redeems > 0
      ? Math.floor(record.max_redeems)
      : null;

  return {
    collectionId,
    creatorId,
    title: template.title,
    ...(template.description ? { description: template.description } : {}),
    mediaUrl: template.mediaUrl,
    priceNear: priceDisplay(priceYocto),
    priceYocto,
    totalSupply,
    minted,
    remaining,
    startTimeMs: nsToMs(record.start_time),
    endTimeMs: nsToMs(record.end_time),
    createdAtMs: nsToMs(record.created_at) ?? 0,
    maxPerWallet:
      record.max_per_wallet != null && record.max_per_wallet > 0
        ? Math.floor(record.max_per_wallet)
        : null,
    mintMode: record.mint_mode?.trim() || 'open',
    paused: Boolean(record.paused),
    cancelled: Boolean(record.cancelled),
    soldOut: totalSupply > 0 && remaining === 0,
    allowlistOnly: allowlistYocto !== '0' || record.mint_mode === 'allowlist',
    appId: record.app_id?.trim() || null,
    kind: template.kind ?? null,
    transferable: record.transferable !== false,
    renewable: Boolean(record.renewable),
    maxRedeems,
    isVariations: template.isVariations,
    seriesId: series?.id ?? null,
    seriesTitle: series?.title ?? null,
    ...(template.sourcePostPath
      ? { sourcePostPath: template.sourcePostPath }
      : {}),
    ...(template.cardBg ? { cardBg: template.cardBg } : {}),
  };
}

/** Live status for badges / CTA gating. */
export function deriveCollectionStatus(
  view: CollectionView,
  nowMs = Date.now()
): CollectionStatus {
  if (view.cancelled) return 'cancelled';
  if (view.soldOut) return 'sold_out';
  if (view.paused) return 'paused';
  if (view.startTimeMs != null && view.startTimeMs > nowMs) return 'upcoming';
  if (view.endTimeMs != null && view.endTimeMs <= nowMs) return 'ended';
  return 'live';
}

export function collectionStatusLabel(status: CollectionStatus): string {
  switch (status) {
    case 'upcoming':
      return 'Starts soon';
    case 'live':
      return 'Live';
    case 'sold_out':
      return 'Sold out';
    case 'ended':
      return 'Ended';
    case 'paused':
      return 'Paused';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** True when anyone can mint / purchase from the drop right now. */
export function isCollectionMintable(status: CollectionStatus): boolean {
  return status === 'live';
}

/** One collection record from the contract, or null when missing. */
export async function fetchCollection(
  collectionId: string
): Promise<CollectionView | null> {
  const id = collectionId.trim();
  if (!id) return null;
  try {
    const record = await viewNearContract<LazyCollectionRecord | null>(
      SCARCES_CONTRACT,
      'get_collection',
      { collection_id: id }
    );
    if (!record) return null;
    return toCollectionView(record);
  } catch {
    return null;
  }
}

/** Collections created by an account, newest first. */
export async function fetchCollectionsByCreator(
  creatorId: string,
  opts: { limit?: number } = {}
): Promise<CollectionView[]> {
  const creator = creatorId.trim();
  if (!creator) return [];
  try {
    const records = await viewNearContract<LazyCollectionRecord[]>(
      SCARCES_CONTRACT,
      'get_collections_by_creator',
      { creator_id: creator, from_index: 0, limit: opts.limit ?? 24 }
    );
    if (!Array.isArray(records)) return [];
    return records
      .map(toCollectionView)
      .filter((view): view is CollectionView => view != null)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch {
    return [];
  }
}

/**
 * Drops published under a store. Prefer indexer create events (app_id),
 * then hydrate live records from the contract.
 */
export async function fetchCollectionsByApp(
  appId: string,
  opts: { limit?: number } = {}
): Promise<CollectionView[]> {
  const id = appId.trim();
  if (!id) return [];
  const limit = opts.limit ?? 40;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const events = await client.query.scarces.events({
      appId: id,
      eventType: 'COLLECTION_UPDATE',
      operation: 'create',
      limit,
    });
    const collectionIds = [
      ...new Set(
        events
          .map((row) => row.collectionId?.trim())
          .filter((value): value is string => Boolean(value))
      ),
    ];
    if (collectionIds.length === 0) return [];

    const views = await Promise.all(
      collectionIds.map((collectionId) => fetchCollection(collectionId))
    );
    return views
      .filter((view): view is CollectionView => view != null)
      .filter((view) => !view.appId || view.appId === id)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch {
    // Fall through to contract scan only when indexer is unavailable.
  }

  try {
    const records = await viewNearContract<LazyCollectionRecord[]>(
      SCARCES_CONTRACT,
      'get_all_collections',
      { from_index: 0, limit: Math.min(100, Math.max(limit, 40)) }
    );
    if (!Array.isArray(records)) return [];
    return records
      .map(toCollectionView)
      .filter((view): view is CollectionView => view != null)
      .filter((view) => view.appId === id)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Wallet's remaining mint allowance, or null when uncapped. */
export async function fetchWalletMintRemaining(
  collectionId: string,
  accountId: string
): Promise<number | null> {
  const id = collectionId.trim();
  const account = accountId.trim();
  if (!id || !account) return null;
  try {
    const remaining = await viewNearContract<number | null>(
      SCARCES_CONTRACT,
      'get_wallet_mint_remaining',
      { collection_id: id, account_id: account }
    );
    if (remaining == null) return null;
    const n = Math.floor(Number(remaining));
    return Number.isFinite(n) ? Math.max(0, n) : null;
  } catch {
    return null;
  }
}
