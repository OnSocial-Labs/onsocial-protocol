import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { formatPostTimestamp } from '@/lib/post-display';

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
    quantity?: number | null;
    extraData?: string | null;
  }>
): CollectionActivityRow[] {
  return rows.map((row, index) => {
    const operation = row.operation?.trim() || 'unknown';
    const isCreate = operation === 'create';
    const quantity = isCreate ? null : activityBatchQuantity(row);
    const unitYocto = isCreate ? null : activityUnitYocto(row, quantity);
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
      timeTitle:
        row.blockTimestamp != null && row.blockTimestamp > 0
          ? formatPostTimestamp(row.blockTimestamp)
          : undefined,
      priceNear: yoctoToNearDisplay(unitYocto),
      quantity,
      uniformBatch: quantity != null && quantity > 1,
    };
  });
}

function activityExtra(
  extraData: string | null | undefined
): Record<string, unknown> | null {
  if (!extraData?.trim()) return null;
  try {
    const parsed = JSON.parse(extraData) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function activityBatchQuantity(row: {
  quantity?: number | null;
  extraData?: string | null;
}): number | null {
  if (
    row.quantity != null &&
    Number.isInteger(row.quantity) &&
    row.quantity > 0
  ) {
    return row.quantity;
  }
  const ids = activityExtra(row.extraData)?.token_ids;
  if (!Array.isArray(ids)) return null;
  const count = ids.filter(
    (id) => typeof id === 'string' && id.trim().length > 0
  ).length;
  return count > 1 ? count : null;
}

/** Unit yocto. A batch `price` is the total and is split before display. */
function activityUnitYocto(
  row: {
    price?: string | null;
    amount?: string | null;
    extraData?: string | null;
  },
  quantity: number | null
): string | null {
  const unit = activityExtra(row.extraData)?.unit_price;
  if (typeof unit === 'string' && /^\d+$/.test(unit)) return unit;
  const total = row.price ?? row.amount ?? null;
  if (
    quantity != null &&
    quantity > 1 &&
    total &&
    /^\d+$/.test(total)
  ) {
    return (BigInt(total) / BigInt(quantity)).toString();
  }
  return total;
}
