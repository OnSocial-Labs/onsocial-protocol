import type { ScarcesEventRow } from '@onsocial/sdk';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export type ScarceEarningKind = 'sale' | 'royalty';

export interface ScarceCreatorEarningRow {
  key: string;
  buyerId: string;
  paymentYocto: string;
  title: string;
  /** Primary sale vs secondary `royalty_paid`. */
  kind: ScarceEarningKind;
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

/** Secondary royalty events vs primary creator sales. */
export function earningKindFromRow(row: ScarcesEventRow): ScarceEarningKind {
  if (row.operation === 'royalty_paid') return 'royalty';
  return 'sale';
}

function saleTitleFromRow(row: ScarcesEventRow): string {
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
    items.push({
      key: `${row.blockHeight}:${row.listingId ?? ''}:${row.tokenId ?? ''}:${pay}:${buyerId}`,
      buyerId,
      paymentYocto: pay,
      title: saleTitleFromRow(row),
      kind: earningKindFromRow(row),
      blockTimestamp: row.blockTimestamp,
      blockHeight: row.blockHeight,
      ...(row.tokenId?.trim() ? { tokenId: row.tokenId.trim() } : {}),
      ...(row.listingId?.trim() ? { listingId: row.listingId.trim() } : {}),
    });
  }

  return { totalYocto: total.toString(), items };
}
