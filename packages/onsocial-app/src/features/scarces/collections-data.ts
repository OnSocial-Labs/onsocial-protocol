import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import {
  resolveScarceMediaUrl,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  DROP_WRITING_MAX_CHAPTERS,
  isLikelyIpfsCid,
  bookPdfFromManifest,
  parseWritingFormat,
  parseWritingManifest,
  readablesFromManifest,
  writingContentUrl,
  type ScarceReadableMedia,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import {
  inferAudioFormatFromPlayableCount,
  parseAudioFormat,
  parseDropFacets,
} from '@/features/scarces/drop-facets';
import {
  parseTicketEventFromCollectionMetadata,
  parseTicketEventFromExtra,
} from '@/features/scarces/ticket-event-meta';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

export type { ScarceReadableMedia, WritingReleaseFormat };

/**
 * Collection (drop) reads — supply-capped, optionally timed / allowlisted
 * edition sets. Browse + soft refresh prefer `scarces_collections_current`;
 * contract `get_collection` only when the catalog row is missing/thin.
 * Wallet mint / allowlist remaining stay on RPC (viewer-scoped).
 */

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Raw on-chain `LazyCollection` fields this app reads. */
export interface LazyCollectionRecord {
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
  /** Snapshot of hub primary-sale commission at create (`u16::MAX` = legacy). */
  app_commission_bps?: number | null;
  transferable?: boolean;
  renewable?: boolean;
  max_redeems?: number | null;
  metadata?: string | null;
  random_assignment?: boolean;
  royalty?: Record<string, number> | null;
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
  /** True when the drop has a timed Opens — early mint is allowlist-gated before then. */
  hasAllowlist: boolean;
  appId: string | null;
  /**
   * Hub primary-sale commission snapshotted at create (bps), or null when
   * the drop has no hub / legacy sentinel (live hub rate).
   */
  appCommissionBps: number | null;
  /** Medium taxonomy from metadata.extra.kind when set. */
  kind: string | null;
  /** Audio release format from `extra.audioFormat` (or inferred from playables). */
  audioFormat: 'single' | 'album' | 'podcast' | null;
  /** Discovery facets (genres / subjects) from `extra.facets`. */
  facets: string[];
  /** Audio / video clips from metadata.extra.playable (music albums, etc.). */
  playables: ScarcePlayableMedia[];
  /** Markdown chapters (from writing manifesto or legacy extra.readable). */
  readables: ScarceReadableMedia[];
  /** Optional whole-book PDF for holder download (manifest only — not a TOC chapter). */
  bookPdf: ScarceReadableMedia | null;
  /** Article vs book when kind is writing. */
  writingFormat: WritingReleaseFormat | null;
  /** IPFS CID of onsocial.writing.v1 manifesto (preferred for books). */
  writingManifestCid: string | null;
  transferable: boolean;
  renewable: boolean;
  maxRedeems: number | null;
  /** True when every token resolves its own artwork (media has a seat placeholder). */
  isVariations: boolean;
  /** True when mints draw a random unminted seat instead of the next one. */
  randomAssignment: boolean;
  /** Series grouping (from collection metadata `series`), when set. */
  seriesId: string | null;
  seriesTitle: string | null;
  /** Event validity start (ms) from metadata.extra — tickets. */
  eventStartsAtMs: number | null;
  /** Event validity end (ms) from metadata.extra — tickets. */
  eventEndsAtMs: number | null;
  /** Intentional place slug from metadata.extra — tickets. */
  place: string | null;
  /**
   * Shared access end (ms) from NEP-177 `expires_at` on the mint template.
   * Coupons require it; memberships optional; tickets stamp it from Event ends.
   */
  accessEndsAtMs: number | null;
  /**
   * Resale royalty map (account → bps). Empty / missing means none.
   * Stored on the collection and stamped onto minted tokens.
   */
  royalty: Record<string, number> | null;
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

/** NEP-177 `expires_at` is milliseconds since epoch. */
function asPositiveExpiresAtMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  return null;
}

/** Normalize on-chain royalty map; drop empty / invalid entries. */
function parseRoyalty(
  raw: Record<string, number> | null | undefined
): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [accountId, value] of Object.entries(raw)) {
    const id = accountId.trim();
    const bps = Math.floor(Number(value));
    if (!id || !Number.isSafeInteger(bps) || bps <= 0) continue;
    out[id] = bps;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** `u16::MAX` on-chain = legacy collection; use live hub rate. */
const APP_COMMISSION_SENTINEL = 65_535;

function parseAppCommissionBps(
  raw: number | null | undefined,
  hasApp: boolean
): number | null {
  if (!hasApp) return null;
  if (raw == null || !Number.isFinite(raw)) return null;
  const bps = Math.floor(Number(raw));
  if (bps === APP_COMMISSION_SENTINEL) return null;
  return Math.max(0, Math.min(5_000, bps));
}

function playablesFromExtraRecord(
  extra: Record<string, unknown> | null | undefined
): ScarcePlayableMedia[] {
  const entries = extra?.playable;
  if (!Array.isArray(entries)) return [];
  const out: ScarcePlayableMedia[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    const cid = typeof record?.cid === 'string' ? record.cid.trim() : '';
    const mime = typeof record?.mime === 'string' ? record.mime.trim() : '';
    if (!cid || !mime) continue;
    const url = resolveScarceMediaUrl(cid);
    if (!url) continue;
    const title =
      typeof record?.title === 'string' && record.title.trim()
        ? record.title.trim()
        : undefined;
    const lyrics =
      typeof record?.lyrics === 'string' && record.lyrics.trim()
        ? record.lyrics
        : undefined;
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

function readablesFromExtraRecord(
  extra: Record<string, unknown> | null | undefined
): ScarceReadableMedia[] {
  const entries = extra?.readable;
  if (!Array.isArray(entries)) return [];
  const out: ScarceReadableMedia[] = [];
  for (const entry of entries) {
    if (out.length >= DROP_WRITING_MAX_CHAPTERS) break;
    const record = asRecord(entry);
    const cid = typeof record?.cid === 'string' ? record.cid.trim() : '';
    const mime = typeof record?.mime === 'string' ? record.mime.trim() : '';
    if (!cid || !mime || !isLikelyIpfsCid(cid)) continue;
    const url = writingContentUrl(cid);
    if (!url) continue;
    const title =
      typeof record?.title === 'string' && record.title.trim()
        ? record.title.trim()
        : undefined;
    out.push({ url, mime, cid, ...(title ? { title } : {}) });
  }
  return out;
}

function writingManifestCidFromExtra(
  extra: Record<string, unknown> | null | undefined
): string | null {
  const raw = extra?.writingManifest;
  if (typeof raw !== 'string') return null;
  const cid = raw.trim().replace(/^ipfs:\/\//, '');
  return cid && isLikelyIpfsCid(cid) ? cid : null;
}

interface TemplateMeta {
  title: string;
  description?: string;
  mediaUrl: string | null;
  isVariations: boolean;
  sourcePostPath?: string;
  cardBg?: string;
  kind?: string;
  audioFormat?: 'single' | 'album' | 'podcast';
  facets?: string[];
  playables?: ScarcePlayableMedia[];
  readables?: ScarceReadableMedia[];
  writingFormat?: WritingReleaseFormat;
  writingManifestCid?: string;
  eventStartsAtMs?: number | null;
  eventEndsAtMs?: number | null;
  place?: string | null;
  /** NEP-177 template `expires_at` (ms). */
  accessEndsAtMs?: number | null;
}

const VARIATION_PLACEHOLDER = /\{(seat_number|index|token_id)\}/;

/**
 * Cover art for a variation drop: the template media resolved for the
 * creator-chosen cover seat (defaults to seat 1).
 */
function substituteSeat(
  media: string,
  collectionId: string,
  seat: number
): string {
  return media
    .replace(/\{seat_number\}/g, String(seat))
    .replace(/\{index\}/g, String(seat - 1))
    .replace(/\{token_id\}/g, `${collectionId}:${seat}`);
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

/**
 * Parse packaging cover from collection freeform metadata.
 * `cover.seat` = hero variation; `cover.url` = optional collage (or packaging) face.
 */
export function parseCoverMeta(metadataJson: string | null | undefined): {
  seat: number | null;
  url: string | null;
  style: string | null;
  label: boolean | null;
  showTitle: boolean | null;
  paper: string | null;
  font: string | null;
} {
  const empty = {
    seat: null as number | null,
    url: null as string | null,
    style: null as string | null,
    label: null as boolean | null,
    showTitle: null as boolean | null,
    paper: null as string | null,
    font: null as string | null,
  };
  if (!metadataJson?.trim()) return empty;
  try {
    const meta = asRecord(JSON.parse(metadataJson));
    const cover = asRecord(meta?.cover);
    if (!cover) return empty;
    const seatNum = Number(cover.seat);
    const seat =
      Number.isSafeInteger(seatNum) && seatNum >= 1 ? seatNum : null;
    const url =
      typeof cover.url === 'string' && cover.url.trim()
        ? cover.url.trim()
        : null;
    const style =
      typeof cover.style === 'string' && cover.style.trim()
        ? cover.style.trim()
        : null;
    const label =
      typeof cover.label === 'boolean'
        ? cover.label
        : cover.label === 'true'
          ? true
          : cover.label === 'false'
            ? false
            : null;
    const showTitle =
      typeof cover.showTitle === 'boolean'
        ? cover.showTitle
        : cover.showTitle === 'true'
          ? true
          : cover.showTitle === 'false'
            ? false
            : null;
    const paper =
      typeof cover.paper === 'string' && cover.paper.trim()
        ? cover.paper.trim()
        : null;
    const font =
      typeof cover.font === 'string' && cover.font.trim()
        ? cover.font.trim()
        : null;
    return { seat, url, style, label, showTitle, paper, font };
  } catch {
    return empty;
  }
}

/** @deprecated Prefer parseCoverMeta — seat-only helper kept for call sites. */
function parseCoverSeat(
  metadataJson: string | null | undefined
): number | null {
  return parseCoverMeta(metadataJson).seat;
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
  collectionId: string,
  coverSeat = 1
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
        ? substituteSeat(rawMedia, collectionId, coverSeat)
        : rawMedia
    );
    let sourcePostPath: string | undefined;
    let cardBg: string | undefined;
    let kind: string | undefined;
    let audioFormat: 'single' | 'album' | 'podcast' | undefined;
    let facets: string[] | undefined;
    let playables: ScarcePlayableMedia[] | undefined;
    let readables: ScarceReadableMedia[] | undefined;
    let writingFormat: WritingReleaseFormat | undefined;
    let writingManifestCid: string | undefined;
    let eventStartsAtMs: number | null | undefined;
    let eventEndsAtMs: number | null | undefined;
    let place: string | null | undefined;
    const accessEndsAtMs = asPositiveExpiresAtMs(meta.expires_at);
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
        const parsedPlayables = playablesFromExtraRecord(extra);
        if (parsedPlayables.length > 0) playables = parsedPlayables;
        const parsedAudioFormat = parseAudioFormat(extra?.audioFormat);
        if (parsedAudioFormat) audioFormat = parsedAudioFormat;
        const parsedFacets = parseDropFacets(extra, kind);
        if (parsedFacets.length > 0) facets = parsedFacets;
        const manifestCid = writingManifestCidFromExtra(extra);
        if (manifestCid) writingManifestCid = manifestCid;
        // Legacy v1: chapters listed inline in extra.readable.
        const parsedReadables = readablesFromExtraRecord(extra);
        if (parsedReadables.length > 0) readables = parsedReadables;
        const parsedFormat = parseWritingFormat(extra?.writingFormat);
        if (parsedFormat) writingFormat = parsedFormat;
        const eventMeta = parseTicketEventFromExtra(extra);
        eventStartsAtMs = eventMeta.eventStartsAtMs;
        eventEndsAtMs = eventMeta.eventEndsAtMs;
        place = eventMeta.place;
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
      ...(audioFormat ? { audioFormat } : {}),
      ...(facets ? { facets } : {}),
      ...(playables ? { playables } : {}),
      ...(readables ? { readables } : {}),
      ...(writingFormat ? { writingFormat } : {}),
      ...(writingManifestCid ? { writingManifestCid } : {}),
      ...(eventStartsAtMs != null ? { eventStartsAtMs } : {}),
      ...(eventEndsAtMs != null ? { eventEndsAtMs } : {}),
      ...(place ? { place } : {}),
      ...(accessEndsAtMs != null ? { accessEndsAtMs } : {}),
    };
  } catch {
    return fallback;
  }
}

/** Pure record → view mapping — exported for unit tests. */
export function toCollectionView(
  record: LazyCollectionRecord
): CollectionView | null {
  const collectionId = record.collection_id?.trim();
  const creatorId = record.creator_id?.trim();
  if (!collectionId || !creatorId) return null;
  if (record.banned) return null;

  const totalSupply = Math.max(0, Math.floor(Number(record.total_supply) || 0));
  const minted = Math.max(0, Math.floor(Number(record.minted_count) || 0));
  const remaining = Math.max(0, totalSupply - minted);
  const priceYocto = yoctoString(record.price_near);
  const startTimeMs = nsToMs(record.start_time);
  const coverMeta = parseCoverMeta(record.metadata);
  const coverSeatRaw = coverMeta.seat;
  // Fall back to seat 1 when the chosen seat is missing or out of range.
  const coverSeat =
    coverSeatRaw != null && (totalSupply === 0 || coverSeatRaw <= totalSupply)
      ? coverSeatRaw
      : 1;
  const template = parseTemplate(
    record.metadata_template,
    collectionId,
    coverSeat
  );
  const packagingUrl = resolveScarceMediaUrl(coverMeta.url);
  const series = parseSeries(record.metadata);
  const eventOverride = parseTicketEventFromCollectionMetadata(record.metadata);
  const maxRedeems =
    record.max_redeems != null && record.max_redeems > 0
      ? Math.floor(record.max_redeems)
      : null;

  const kind = template.kind ?? null;
  const playables = template.playables ?? [];
  const isAudioKind = kind === 'audio' || kind === 'music';
  const audioFormat = isAudioKind
    ? (template.audioFormat ??
      inferAudioFormatFromPlayableCount(playables.length))
    : null;
  const facets = template.facets ?? [];

  return {
    collectionId,
    creatorId,
    title: template.title,
    ...(template.description ? { description: template.description } : {}),
    mediaUrl: packagingUrl ?? template.mediaUrl,
    priceNear: priceDisplay(priceYocto),
    priceYocto,
    totalSupply,
    minted,
    remaining,
    startTimeMs,
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
    // Chain gates pre-Opens mint on allowlist entries, not allowlist_price.
    hasAllowlist: startTimeMs != null,
    appId: record.app_id?.trim() || null,
    appCommissionBps: parseAppCommissionBps(
      record.app_commission_bps,
      Boolean(record.app_id?.trim())
    ),
    kind,
    audioFormat,
    facets,
    playables,
    readables: template.readables ?? [],
    bookPdf: null,
    writingFormat:
      template.writingFormat ??
      (template.readables && template.readables.length > 1
        ? 'book'
        : template.readables && template.readables.length === 1
          ? 'article'
          : null),
    writingManifestCid: template.writingManifestCid ?? null,
    transferable: record.transferable !== false,
    renewable: Boolean(record.renewable),
    maxRedeems,
    isVariations: template.isVariations,
    randomAssignment: Boolean(record.random_assignment),
    seriesId: series?.id ?? null,
    seriesTitle: series?.title ?? null,
    eventStartsAtMs:
      eventOverride.eventStartsAtMs ?? template.eventStartsAtMs ?? null,
    eventEndsAtMs:
      eventOverride.eventEndsAtMs ?? template.eventEndsAtMs ?? null,
    place: eventOverride.place ?? template.place ?? null,
    accessEndsAtMs: template.accessEndsAtMs ?? null,
    royalty: parseRoyalty(record.royalty),
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

/**
 * Map indexer `scarces_collections_current` row → CollectionView.
 * Banned / incomplete shells return null (caller falls back to RPC).
 */
export function collectionCurrentRowToView(row: {
  collectionId: string;
  creatorId: string;
  appId: string | null;
  price: string | null;
  allowlistPrice: string | null;
  totalSupply: number;
  mintedCount: number;
  remaining: number;
  startTime: number | null;
  endTime: number | null;
  createdAt: number | null;
  mintMode: string | null;
  maxPerWallet: number | null;
  paused: boolean;
  cancelled: boolean;
  banned: boolean;
  transferable: boolean | null;
  renewable: boolean | null;
  maxRedeems: number | null;
  randomAssignment: boolean;
  appCommissionBps: number | null;
  title: string | null;
  media: string | null;
  description: string | null;
  kind: string | null;
  metadataTemplate: string | null;
  metadata: string | null;
  extraJson: string | null;
  royaltyJson: string | null;
}): CollectionView | null {
  if (row.banned) return null;
  let royalty: Record<string, number> | null = null;
  if (row.royaltyJson?.trim()) {
    try {
      const parsed: unknown = JSON.parse(row.royaltyJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        royalty = parsed as Record<string, number>;
      }
    } catch {
      royalty = null;
    }
  }

  let metadataTemplate = row.metadataTemplate?.trim() || '';
  if (!metadataTemplate) {
    // Thin historical rows: synthesize enough template for first paint.
    if (!row.title?.trim() && !row.media?.trim()) return null;
    const extra =
      row.extraJson?.trim() ||
      (row.kind?.trim()
        ? JSON.stringify({ kind: row.kind.trim() })
        : undefined);
    metadataTemplate = JSON.stringify({
      ...(row.title?.trim() ? { title: row.title.trim() } : {}),
      ...(row.description?.trim()
        ? { description: row.description.trim() }
        : {}),
      ...(row.media?.trim() ? { media: row.media.trim() } : {}),
      ...(extra ? { extra } : {}),
    });
  }

  return toCollectionView({
    collection_id: row.collectionId,
    creator_id: row.creatorId,
    total_supply: row.totalSupply,
    minted_count: row.mintedCount,
    metadata_template: metadataTemplate,
    price_near: row.price,
    allowlist_price: row.allowlistPrice,
    start_time: row.startTime,
    end_time: row.endTime,
    created_at: row.createdAt,
    max_per_wallet: row.maxPerWallet,
    mint_mode: row.mintMode,
    paused: row.paused,
    cancelled: row.cancelled,
    banned: row.banned,
    app_id: row.appId,
    app_commission_bps: row.appCommissionBps,
    transferable: row.transferable ?? true,
    renewable: row.renewable ?? false,
    max_redeems: row.maxRedeems,
    metadata: row.metadata,
    random_assignment: row.randomAssignment,
    royalty,
  });
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
    const view = toCollectionView(record);
    if (!view) return null;
    return hydrateWritingManifest(view);
  } catch {
    return null;
  }
}

/** Indexer-first shell; RPC fallback when the catalog row is missing/thin. */
export async function fetchCollectionPreferIndexer(
  collectionId: string
): Promise<CollectionView | null> {
  const id = collectionId.trim();
  if (!id) return null;
  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const row = await client.query.scarces.collectionCurrent(id);
    if (row) {
      const view = collectionCurrentRowToView(row);
      if (view) return hydrateWritingManifest(view);
    }
  } catch {
    // Fall through to RPC.
  }
  return fetchCollection(id);
}

/** Load onsocial.writing.v1 chapters when manifesto CID is present. */
export async function hydrateWritingManifest(
  view: CollectionView
): Promise<CollectionView> {
  const cid = view.writingManifestCid?.trim();
  if (!cid) return view;
  const url =
    typeof window === 'undefined'
      ? resolveScarceMediaUrl(cid)
      : writingContentUrl(cid);
  if (!url) return view;
  try {
    const response = await fetch(url);
    if (!response.ok) return view;
    const json: unknown = await response.json();
    const manifest = parseWritingManifest(json);
    if (!manifest) return view;
    const bookPdf = bookPdfFromManifest(manifest);
    const readables = readablesFromManifest(manifest);
    if (readables.length === 0 && !bookPdf) return view;
    return {
      ...view,
      readables,
      bookPdf,
      writingFormat:
        view.writingFormat ??
        (readables.length > 1 ? 'book' : bookPdf ? 'book' : 'article'),
    };
  } catch {
    return view;
  }
}

/** Collections created by an account, newest first. */
export async function fetchCollectionsByCreator(
  creatorId: string,
  opts: { limit?: number } = {}
): Promise<CollectionView[]> {
  const creator = creatorId.trim();
  if (!creator) return [];
  const limit = opts.limit ?? 24;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const catalog = await client.query.scarces.collectionsCurrent({
      creatorId: creator,
      limit,
      includeUnavailable: true,
    });
    if (catalog.length > 0) {
      const views = catalog
        .map((row) => collectionCurrentRowToView(row))
        .filter((view): view is CollectionView => view != null)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      if (views.length > 0) return views;
    }
  } catch {
    // Fall through to contract scan.
  }

  try {
    const records = await viewNearContract<LazyCollectionRecord[]>(
      SCARCES_CONTRACT,
      'get_collections_by_creator',
      { creator_id: creator, from_index: 0, limit: limit }
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
 * Drops published under a store. Prefer live catalog (`collectionsCurrent`),
 * then create-event ids + RPC, then contract scan.
 */
export async function fetchCollectionsByApp(
  appId: string,
  opts: { limit?: number; client?: import('@onsocial/sdk').OnSocial } = {}
): Promise<CollectionView[]> {
  const id = appId.trim();
  if (!id) return [];
  const limit = opts.limit ?? 40;

  try {
    const client =
      opts.client ??
      (await import('@/lib/create-readonly-onsocial-client'))
        .createReadOnlyOnSocialClient();
    const catalog = await client.query.scarces.collectionsCurrent({
      appId: id,
      limit,
    });
    if (catalog.length > 0) {
      const views = catalog
        .map((row) => collectionCurrentRowToView(row))
        .filter((view): view is CollectionView => view != null)
        .filter((view) => !view.appId || view.appId === id)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      if (views.length > 0) return views;
    }

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

/** Remaining allowlist allocation for a wallet (0 = none / exhausted). */
export async function fetchAllowlistRemaining(
  collectionId: string,
  accountId: string
): Promise<number> {
  const id = collectionId.trim();
  const account = accountId.trim();
  if (!id || !account) return 0;
  try {
    const remaining = await viewNearContract<number>(
      SCARCES_CONTRACT,
      'get_allowlist_remaining',
      { collection_id: id, account_id: account }
    );
    const n = Math.floor(Number(remaining));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

/** Stored allowlist mint cap for a wallet (0 = not on list). */
export async function fetchAllowlistAllocation(
  collectionId: string,
  accountId: string
): Promise<number> {
  const id = collectionId.trim();
  const account = accountId.trim();
  if (!id || !account) return 0;
  try {
    const allocation = await viewNearContract<number>(
      SCARCES_CONTRACT,
      'get_allowlist_allocation',
      { collection_id: id, account_id: account }
    );
    const n = Math.floor(Number(allocation));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

/**
 * True when `accountId` currently owns at least one edition of this drop.
 * Prefers indexer `scarcesTokenOwners`; falls back to full RPC ownership scan.
 */
export async function fetchOwnsCollectionEdition(
  collectionId: string,
  accountId: string
): Promise<boolean> {
  const tokenId = await fetchOwnedCollectionTokenId(collectionId, accountId);
  return Boolean(tokenId);
}

/**
 * First owned edition token id for this drop, or null.
 * Prefers indexer `scarcesTokenOwners`; falls back to RPC ownership scan.
 */
export async function fetchOwnedCollectionTokenId(
  collectionId: string,
  accountId: string
): Promise<string | null> {
  const id = collectionId.trim();
  const account = accountId.trim();
  if (!id || !account) return null;

  try {
    const client = createAppOnSocialClient(account);
    const res = await client.query.graphql<{
      scarcesTokenOwners: Array<{ tokenId?: string | null }>;
    }>({
      query: `
        query OwnsCollectionEdition($ownerId: String!, $collectionId: String!) {
          scarcesTokenOwners(
            where: {
              ownerId: { _eq: $ownerId }
              collectionId: { _eq: $collectionId }
              burned: { _eq: false }
            }
            limit: 1
          ) {
            tokenId
          }
        }
      `,
      variables: { ownerId: account, collectionId: id },
    });
    const tokenId = res.data?.scarcesTokenOwners?.[0]?.tokenId?.trim();
    if (tokenId) return tokenId;
  } catch {
    // Indexer lag / schema — fall through to RPC.
  }

  const prefix = `${id}:`;
  let total = 0;
  try {
    const supply = await viewNearContract<string | number>(
      SCARCES_CONTRACT,
      'nft_supply_for_owner',
      { account_id: account }
    );
    total = Math.floor(Number(supply));
  } catch {
    return null;
  }
  if (!Number.isFinite(total) || total <= 0) return null;

  const pageSize = 50;
  for (let fromIndex = 0; fromIndex < total; fromIndex += pageSize) {
    const limit = Math.min(pageSize, total - fromIndex);
    try {
      const tokens = await viewNearContract<Array<{ token_id?: string }>>(
        SCARCES_CONTRACT,
        'nft_tokens_for_owner',
        {
          account_id: account,
          from_index: String(fromIndex),
          limit,
        }
      );
      if (!Array.isArray(tokens)) continue;
      for (const token of tokens) {
        const tokenId = token.token_id?.trim() ?? '';
        if (tokenId.startsWith(prefix)) return tokenId;
      }
    } catch {
      return null;
    }
  }
  return null;
}
