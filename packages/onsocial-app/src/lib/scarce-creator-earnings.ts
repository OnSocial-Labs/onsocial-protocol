import type { ScarcesEventRow } from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  personalPostPath,
  resolvePostThreadHrefFromSourcePath,
} from '@/lib/post-routes';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export type ScarceEarningKind = 'sale' | 'royalty';

export interface ScarceCreatorEarningRow {
  key: string;
  buyerId: string;
  paymentYocto: string;
  title: string;
  /** Primary sale vs secondary `royalty_paid`. */
  kind: ScarceEarningKind;
  /** Gross sale price (yocto) when the event carries it — used for royalty context. */
  salePriceYocto?: string;
  sellerId?: string;
  /** App route to the source post when metadata carries `sourcePost`. */
  postHref?: string;
  blockTimestamp: number;
  blockHeight: number;
  tokenId?: string;
  listingId?: string;
  collectionId?: string;
}

export interface ScarceCreatorEarnings {
  totalYocto: string;
  items: ScarceCreatorEarningRow[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  record: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Prefer explicit `creatorPayment`. When present (including `"0"`), never fall
 * back to full sale `price` — that would mis-attribute secondary sales.
 */
function paymentYocto(row: ScarcesEventRow): string | null {
  const payment = row.creatorPayment?.trim();
  if (payment != null && payment !== '' && /^\d+$/.test(payment)) {
    if (payment === '0') return null;
    return payment;
  }
  const raw = row.price?.trim() || null;
  if (!raw || !/^\d+$/.test(raw) || raw === '0') return null;
  return raw;
}

function salePriceYocto(row: ScarcesEventRow): string | undefined {
  const raw = row.price?.trim();
  if (!raw || !/^\d+$/.test(raw) || raw === '0') return undefined;
  return raw;
}

/** Secondary royalty events vs primary creator sales. */
export function earningKindFromRow(row: ScarcesEventRow): ScarceEarningKind {
  if (row.operation === 'royalty_paid') return 'royalty';
  return 'sale';
}

export function sourcePostPathFromExtra(
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

/** Sync personal-only href — prefer `resolvePostThreadHrefFromSourcePath`. */
export function postHrefFromSourcePath(
  path: string | undefined
): string | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return personalPostPath(match[1], match[2]);
}

export function parseEventExtraRecord(
  extraData: string | null | undefined
): Record<string, unknown> | null {
  if (!extraData?.trim()) return null;
  try {
    return asRecord(JSON.parse(extraData));
  } catch {
    return null;
  }
}

/** Pull sparse identity from event JSON when typed columns are empty. */
export function identityFromEventExtra(
  extraData: string | null | undefined
): {
  title?: string;
  tokenId?: string;
  listingId?: string;
  collectionId?: string;
  sourcePostPath?: string;
} {
  const parsed = parseEventExtraRecord(extraData);
  if (!parsed) return {};
  const meta = asRecord(parsed.metadata ?? null);
  const title =
    stringField(parsed, 'title') ?? stringField(meta, 'title') ?? undefined;
  const tokenId =
    stringField(parsed, 'token_id') ??
    stringField(parsed, 'tokenId') ??
    undefined;
  const listingId =
    stringField(parsed, 'listing_id') ??
    stringField(parsed, 'listingId') ??
    undefined;
  const collectionId =
    stringField(parsed, 'collection_id') ??
    stringField(parsed, 'collectionId') ??
    undefined;
  const sourcePostPath = sourcePostPathFromExtra(parsed);
  return {
    ...(title ? { title } : {}),
    ...(tokenId ? { tokenId } : {}),
    ...(listingId ? { listingId } : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(sourcePostPath ? { sourcePostPath } : {}),
  };
}

export function saleTitleFromRow(row: ScarcesEventRow): string {
  const fromExtra = identityFromEventExtra(row.extraData);
  if (fromExtra.title) return fromExtra.title;
  const tokenId = row.tokenId?.trim() || fromExtra.tokenId;
  const listingId = row.listingId?.trim() || fromExtra.listingId;
  if (tokenId) return `Scarce · ${tokenId}`;
  if (listingId) return `Listing · ${listingId}`;
  return 'Scarce sale';
}

/** True when the title is still a placeholder and should be hydrated. */
export function isFallbackEarningTitle(
  title: string,
  tokenId?: string
): boolean {
  const t = title.trim();
  if (!t || t === 'Scarce sale' || t === 'Scarce') return true;
  if (t.startsWith('Listing · ')) return true;
  if (t.startsWith('Scarce · ')) return true;
  if (tokenId && t === `Scarce · ${tokenId}`) return true;
  return false;
}

async function fetchTokenMeta(tokenId: string): Promise<{
  title: string | null;
  postHref: string | null;
}> {
  try {
    const token = await viewNearContract<{
      metadata?: { title?: string | null; extra?: string | null };
    } | null>(SCARCES_CONTRACT, 'nft_token', { token_id: tokenId });
    const title = token?.metadata?.title?.trim() || null;
    let extra: Record<string, unknown> | null = null;
    if (token?.metadata?.extra) {
      try {
        extra = asRecord(JSON.parse(token.metadata.extra));
      } catch {
        extra = null;
      }
    }
    const postHref = await resolvePostThreadHrefFromSourcePath(
      sourcePostPathFromExtra(extra)
    );
    return { title, postHref };
  } catch {
    return { title: null, postHref: null };
  }
}

async function fetchLazyListingMeta(listingId: string): Promise<{
  title: string | null;
  postHref: string | null;
}> {
  try {
    const listing = await viewNearContract<{
      title?: string | null;
      metadata?: { title?: string | null; extra?: string | null };
      extra?: string | null;
    } | null>(SCARCES_CONTRACT, 'get_lazy_listing', {
      listing_id: listingId,
    });
    if (!listing) return { title: null, postHref: null };
    const title =
      listing.title?.trim() || listing.metadata?.title?.trim() || null;
    let extra: Record<string, unknown> | null = null;
    const extraRaw = listing.extra ?? listing.metadata?.extra ?? null;
    if (extraRaw) {
      try {
        extra = asRecord(JSON.parse(extraRaw));
      } catch {
        extra = null;
      }
    }
    const postHref = await resolvePostThreadHrefFromSourcePath(
      sourcePostPathFromExtra(extra)
    );
    return { title, postHref };
  } catch {
    return { title: null, postHref: null };
  }
}

async function fetchCollectionMeta(collectionId: string): Promise<{
  title: string | null;
  postHref: string | null;
}> {
  try {
    const client = createReadOnlyOnSocialClient();
    const row = await client.query.scarces.collectionCurrent(collectionId);
    if (!row || row.banned) return { title: null, postHref: null };
    const title = row.title?.trim() || null;
    const postHref = await resolvePostThreadHrefFromSourcePath(
      row.sourcePostPath ?? undefined
    );
    return { title, postHref };
  } catch {
    return { title: null, postHref: null };
  }
}

/**
 * Resolve placeholder titles + source-post links via token / listing / drop.
 */
export async function enrichEarningRows(
  items: ScarceCreatorEarningRow[]
): Promise<ScarceCreatorEarningRow[]> {
  const needToken = new Map<string, number[]>();
  const needListing = new Map<string, number[]>();
  const needCollection = new Map<string, number[]>();

  items.forEach((item, index) => {
    const needsTitle = isFallbackEarningTitle(item.title, item.tokenId);
    const needsHref = !item.postHref;
    if (!needsTitle && !needsHref) return;

    const tokenId = item.tokenId?.trim();
    const listingId = item.listingId?.trim();
    const collectionId = item.collectionId?.trim();

    if (tokenId && (needsTitle || needsHref)) {
      const idxs = needToken.get(tokenId) ?? [];
      idxs.push(index);
      needToken.set(tokenId, idxs);
      return;
    }
    if (listingId && (needsTitle || needsHref)) {
      const idxs = needListing.get(listingId) ?? [];
      idxs.push(index);
      needListing.set(listingId, idxs);
      return;
    }
    if (collectionId && needsTitle) {
      const idxs = needCollection.get(collectionId) ?? [];
      idxs.push(index);
      needCollection.set(collectionId, idxs);
    }
  });

  if (
    needToken.size === 0 &&
    needListing.size === 0 &&
    needCollection.size === 0
  ) {
    return items;
  }

  const [tokenMetas, listingMetas, collectionMetas] = await Promise.all([
    Promise.all(
      [...needToken.keys()].map(async (id) => [id, await fetchTokenMeta(id)] as const)
    ),
    Promise.all(
      [...needListing.keys()].map(
        async (id) => [id, await fetchLazyListingMeta(id)] as const
      )
    ),
    Promise.all(
      [...needCollection.keys()].map(
        async (id) => [id, await fetchCollectionMeta(id)] as const
      )
    ),
  ]);

  const next = items.slice();

  function applyMeta(
    indexes: number[],
    meta: { title: string | null; postHref: string | null },
    tokenId?: string
  ) {
    for (const index of indexes) {
      const cur = next[index]!;
      next[index] = {
        ...cur,
        ...(meta.title && isFallbackEarningTitle(cur.title, tokenId ?? cur.tokenId)
          ? { title: meta.title }
          : {}),
        ...(meta.postHref && !cur.postHref ? { postHref: meta.postHref } : {}),
      };
    }
  }

  for (const [tokenId, meta] of tokenMetas) {
    applyMeta(needToken.get(tokenId) ?? [], meta, tokenId);
  }
  for (const [listingId, meta] of listingMetas) {
    applyMeta(needListing.get(listingId) ?? [], meta);
  }
  for (const [collectionId, meta] of collectionMetas) {
    applyMeta(needCollection.get(collectionId) ?? [], meta);
  }

  // Second pass: rows still placeholder after token/listing — try collection.
  const stillNeedCollection = new Map<string, number[]>();
  next.forEach((item, index) => {
    if (!isFallbackEarningTitle(item.title, item.tokenId)) return;
    const collectionId = item.collectionId?.trim();
    if (!collectionId || needCollection.has(collectionId)) return;
    const idxs = stillNeedCollection.get(collectionId) ?? [];
    idxs.push(index);
    stillNeedCollection.set(collectionId, idxs);
  });
  if (stillNeedCollection.size > 0) {
    const more = await Promise.all(
      [...stillNeedCollection.keys()].map(
        async (id) => [id, await fetchCollectionMeta(id)] as const
      )
    );
    for (const [collectionId, meta] of more) {
      applyMeta(stillNeedCollection.get(collectionId) ?? [], meta);
    }
  }

  return next;
}

export const EARNINGS_KIND_LEGEND: ReadonlyArray<{
  kind: ScarceEarningKind;
  label: string;
}> = [
  { kind: 'sale', label: 'Sales' },
  { kind: 'royalty', label: 'Royalties' },
];

export type ScarceEarningsKindTotal = {
  kind: ScarceEarningKind;
  label: string;
  amountLabel: string;
};

/**
 * Compact kind totals — same rhythm as Support
 * (`Profile support 113.85 · Boost share 30.60`).
 */
export function scarceEarningsKindTotals(
  rows: ReadonlyArray<{ kind: ScarceEarningKind; paymentYocto: string }>,
  formatAmount: (yocto: string) => string = formatEarningsNearCompact
): ScarceEarningsKindTotal[] {
  const totals = new Map<ScarceEarningKind, bigint>();
  for (const row of rows) {
    let amount = 0n;
    try {
      amount = BigInt(row.paymentYocto || '0');
    } catch {
      continue;
    }
    if (amount <= 0n) continue;
    totals.set(row.kind, (totals.get(row.kind) ?? 0n) + amount);
  }

  return EARNINGS_KIND_LEGEND.filter((entry) => totals.has(entry.kind)).map(
    (entry) => {
      const yocto = (totals.get(entry.kind) ?? 0n).toString();
      return {
        kind: entry.kind,
        label: entry.label,
        amountLabel: formatAmount(yocto),
      };
    }
  );
}

export function scarceEarningsKindSubtotals(
  rows: ReadonlyArray<{ kind: ScarceEarningKind; paymentYocto: string }>,
  formatAmount: (yocto: string) => string = formatEarningsNearCompact
): string {
  return scarceEarningsKindTotals(rows, formatAmount)
    .map((entry) => `${entry.label} ${entry.amountLabel}`)
    .join(' · ');
}

/** Compact NEAR — same 2dp rhythm as SOCIAL face amounts (`9.00` / `0.99`). */
export function formatEarningsNearCompact(yocto: string): string {
  const near = yoctoToNear(yocto);
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  if (n >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatEarningsNear(yocto: string): string {
  return `${formatEarningsNearCompact(yocto)} NEAR`;
}

/**
 * Trailing context after the title (no date — drawers put date above amount).
 * Royalty: ` · of 1.00 NEAR`.
 */
export function formatEarningKindSuffix(
  row: ScarceCreatorEarningRow,
  when: string = ''
): string {
  const parts: string[] = [];
  if (row.kind === 'royalty' && row.salePriceYocto) {
    parts.push(`of ${formatEarningsNearCompact(row.salePriceYocto)} NEAR`);
  }
  if (when) parts.push(when);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/** One-line kind copy (no link). Pass `when` only for non-drawer surfaces. */
export function formatEarningKindLine(
  row: ScarceCreatorEarningRow,
  when: string = ''
): string {
  const kind = row.kind === 'royalty' ? 'Royalty' : 'Sale';
  const title = row.title.trim();
  return `${kind}${title ? ` · ${title}` : ''}${formatEarningKindSuffix(row, when)}`;
}

export async function fetchScarceCreatorEarnings(
  creatorId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<ScarceCreatorEarnings> {
  const client = createReadOnlyOnSocialClient();
  const rows = await client.query.scarces.creatorEarnings(creatorId, {
    limit: opts.limit ?? 40,
    offset: opts.offset ?? 0,
  });

  let total = 0n;
  const items: ScarceCreatorEarningRow[] = [];
  for (const row of rows) {
    const pay = paymentYocto(row);
    if (!pay) continue;
    total += BigInt(pay);
    const buyerId = row.buyerId?.trim() || row.author?.trim() || 'unknown';
    const price = salePriceYocto(row);
    const sellerId = row.sellerId?.trim();
    const fromExtra = identityFromEventExtra(row.extraData);
    const tokenId = row.tokenId?.trim() || fromExtra.tokenId;
    const listingId = row.listingId?.trim() || fromExtra.listingId;
    const collectionId =
      row.collectionId?.trim() || fromExtra.collectionId;
    const postHref = fromExtra.sourcePostPath
      ? postHrefFromSourcePath(fromExtra.sourcePostPath)
      : null;
    items.push({
      key: `${row.blockHeight}:${listingId ?? ''}:${tokenId ?? ''}:${pay}:${buyerId}`,
      buyerId,
      paymentYocto: pay,
      title: saleTitleFromRow(row),
      kind: earningKindFromRow(row),
      ...(price ? { salePriceYocto: price } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(postHref ? { postHref } : {}),
      blockTimestamp: row.blockTimestamp,
      blockHeight: row.blockHeight,
      ...(tokenId ? { tokenId } : {}),
      ...(listingId ? { listingId } : {}),
      ...(collectionId ? { collectionId } : {}),
    });
  }

  const enriched = await enrichEarningRows(items);
  return { totalYocto: total.toString(), items: enriched };
}
