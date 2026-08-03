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

export function saleTitleFromRow(row: ScarcesEventRow): string {
  let parsed: Record<string, unknown> | null = null;
  if (row.extraData) {
    try {
      parsed = asRecord(JSON.parse(row.extraData));
    } catch {
      parsed = null;
    }
  }
  const meta = asRecord(parsed?.metadata ?? null);
  const titled =
    (typeof parsed?.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : null) ??
    (typeof meta?.title === 'string' && meta.title.trim()
      ? meta.title.trim()
      : null);
  if (titled) return titled;
  if (row.tokenId?.trim()) return `Scarce · ${row.tokenId.trim()}`;
  if (row.listingId?.trim()) return `Listing · ${row.listingId.trim()}`;
  return 'Scarce sale';
}

function isFallbackTitle(title: string, tokenId?: string): boolean {
  if (!tokenId) return false;
  return title === `Scarce · ${tokenId}` || title === 'Scarce sale';
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

/**
 * Resolve placeholder titles + source-post links via on-chain `nft_token`.
 */
export async function enrichEarningRows(
  items: ScarceCreatorEarningRow[]
): Promise<ScarceCreatorEarningRow[]> {
  const needFetch = new Map<string, number[]>();
  items.forEach((item, index) => {
    const tokenId = item.tokenId?.trim();
    if (!tokenId) return;
    if (!isFallbackTitle(item.title, tokenId) && item.postHref) return;
    const idxs = needFetch.get(tokenId) ?? [];
    idxs.push(index);
    needFetch.set(tokenId, idxs);
  });
  if (needFetch.size === 0) return items;

  const metas = await Promise.all(
    [...needFetch.keys()].map(async (tokenId) => {
      const meta = await fetchTokenMeta(tokenId);
      return [tokenId, meta] as const;
    })
  );

  const next = items.slice();
  for (const [tokenId, meta] of metas) {
    for (const index of needFetch.get(tokenId) ?? []) {
      const cur = next[index];
      next[index] = {
        ...cur,
        ...(meta.title && isFallbackTitle(cur.title, tokenId)
          ? { title: meta.title }
          : {}),
        ...(meta.postHref && !cur.postHref ? { postHref: meta.postHref } : {}),
      };
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
    items.push({
      key: `${row.blockHeight}:${row.listingId ?? ''}:${row.tokenId ?? ''}:${pay}:${buyerId}`,
      buyerId,
      paymentYocto: pay,
      title: saleTitleFromRow(row),
      kind: earningKindFromRow(row),
      ...(price ? { salePriceYocto: price } : {}),
      ...(sellerId ? { sellerId } : {}),
      blockTimestamp: row.blockTimestamp,
      blockHeight: row.blockHeight,
      ...(row.tokenId?.trim() ? { tokenId: row.tokenId.trim() } : {}),
      ...(row.listingId?.trim() ? { listingId: row.listingId.trim() } : {}),
    });
  }

  const enriched = await enrichEarningRows(items);
  return { totalYocto: total.toString(), items: enriched };
}
