import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';
import { formatMarketRelativeTime } from '@/features/market/market-listings';

const NEAR_DECIMALS = 24;

function yoctoToNearDisplay(raw: string | null | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
  const near = frac ? `${whole}.${frac}` : whole;
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const OPERATION_LABEL: Record<string, string> = {
  create: 'Drop created',
  purchase: 'Minted',
  creator_mint: 'Minted',
  mint_from_collection: 'Minted',
  airdrop: 'Airdropped',
  cancel: 'Cancelled',
  refund: 'Refunded',
  set_allowlist: 'Allowlist updated',
  redeemer_added: 'Door staff added',
  redeemer_removed: 'Door staff removed',
  pause: 'Paused',
  resume: 'Resumed',
};

/** Map indexer scarces event rows → drop activity list rows. */
export function mapCollectionActivityRows(
  rows: Array<{
    operation?: string | null;
    blockTimestamp?: number | null;
    buyerId?: string | null;
    ownerId?: string | null;
    author?: string | null;
    price?: string | null;
    amount?: string | null;
  }>
): CollectionActivityRow[] {
  return rows.map((row, index) => {
    const operation = row.operation?.trim() || 'unknown';
    const isCreate = operation === 'create';
    return {
      key: `${operation}:${row.blockTimestamp}:${index}`,
      operation,
      label: OPERATION_LABEL[operation] ?? operation,
      actor:
        row.buyerId?.trim() ||
        row.ownerId?.trim() ||
        row.author?.trim() ||
        null,
      time: formatMarketRelativeTime(row.blockTimestamp ?? 0) ?? '',
      priceNear: isCreate
        ? null
        : yoctoToNearDisplay(row.price ?? row.amount),
    };
  });
}
