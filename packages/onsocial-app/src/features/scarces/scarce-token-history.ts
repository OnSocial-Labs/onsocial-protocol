import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { formatPostTimestamp } from '@/lib/post-display';

const NEAR_DECIMALS = 24;

/** One indexer row from `tokenHistory`. Extra columns stay in `extraData`. */
export interface TokenHistoryEvent {
  eventType?: string | null;
  operation?: string | null;
  author?: string | null;
  blockHeight?: number | null;
  blockTimestamp?: number | string | null;
  ownerId?: string | null;
  creatorId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  bidder?: string | null;
  price?: string | null;
  amount?: string | null;
  newPrice?: string | null;
  bidAmount?: string | null;
  reservePrice?: string | null;
  creatorPayment?: string | null;
  extraData?: string | null;
}

const OPERATION_LABEL: Record<string, string> = {
  list: 'Listed',
  delist: 'Delisted',
  update_price: 'Price changed',
  purchase: 'Bought',
  purchase_failed: 'Purchase failed',
  transfer: 'Transferred',
  list_native: 'Listed',
  delist_native: 'Delisted',
  auto_delist: 'Delisted',
  renew: 'Renewed',
  revoke: 'Revoked',
  redeem: 'Redeemed',
  burn: 'Burned',
  approval_granted: 'Approval granted',
  approval_revoked: 'Approval removed',
  all_approvals_revoked: 'Approvals removed',
  auction_created: 'Auction opened',
  auction_bid: 'Bid',
  auction_settled: 'Settled',
  auction_cancelled: 'Auction cancelled',
  quick_mint: 'Minted',
  royalty_paid: 'Royalty',
  creator_mint: 'Minted',
  airdrop: 'Airdropped',
  purchased: 'Minted',
  created: 'Listed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  price_updated: 'Price changed',
  offer_made: 'Offer made',
  offer_cancelled: 'Offer cancelled',
  offer_accepted: 'Offer accepted',
  collection_offer_made: 'Offer made',
  collection_offer_cancelled: 'Offer cancelled',
  collection_offer_accepted: 'Offer accepted',
};

/** Events that move the edition without a price of their own. */
const NO_PRICE = new Set([
  'transfer',
  'delist',
  'delist_native',
  'auto_delist',
  'burn',
  'redeem',
  'renew',
  'revoke',
  'approval_granted',
  'approval_revoked',
  'all_approvals_revoked',
  'offer_cancelled',
  'collection_offer_cancelled',
  'cancel',
  'cancelled',
  'expired',
  'pause',
  'resume',
  'create',
]);

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

function account(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

function firstAccount(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const id = account(value);
    if (id) return id;
  }
  return null;
}

function extraString(
  extraData: string | null | undefined,
  key: string
): string | null {
  if (!extraData?.trim()) return null;
  try {
    const parsed = JSON.parse(extraData) as Record<string, unknown>;
    const value = parsed[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function timestampNumber(raw: number | string | null | undefined): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function historyLabel(operation: string, eventType: string): string {
  if (operation === 'purchase' && eventType === 'COLLECTION_UPDATE') {
    return 'Minted';
  }
  return (
    OPERATION_LABEL[operation] ??
    (operation
      ? operation.charAt(0).toUpperCase() + operation.slice(1).replace(/_/g, ' ')
      : 'Updated')
  );
}

function historyActor(row: TokenHistoryEvent, operation: string): string | null {
  switch (operation) {
    case 'transfer':
      return firstAccount(
        extraString(row.extraData, 'receiver_id'),
        row.author
      );
    case 'purchase':
    case 'purchased':
    case 'offer_accepted':
    case 'collection_offer_accepted':
      return firstAccount(row.buyerId, row.ownerId, row.author);
    case 'auction_bid':
    case 'offer_made':
    case 'collection_offer_made':
      return firstAccount(row.bidder, row.buyerId, row.author);
    case 'auction_settled':
      return firstAccount(
        row.buyerId,
        extraString(row.extraData, 'winner_id'),
        row.ownerId,
        row.author
      );
    case 'royalty_paid':
      return firstAccount(row.creatorId, row.author);
    case 'burn':
    case 'list':
    case 'list_native':
    case 'delist':
    case 'delist_native':
    case 'auto_delist':
    case 'update_price':
    case 'auction_created':
    case 'auction_cancelled':
      return firstAccount(row.ownerId, row.author);
    default:
      return firstAccount(
        row.buyerId,
        row.ownerId,
        row.bidder,
        row.sellerId,
        row.creatorId,
        row.author
      );
  }
}

function historyPrice(
  row: TokenHistoryEvent,
  operation: string
): string | null {
  if (NO_PRICE.has(operation)) return null;
  if (operation === 'update_price' || operation === 'price_updated') {
    return yoctoToNearDisplay(row.newPrice ?? row.price);
  }
  if (operation === 'auction_bid') {
    return yoctoToNearDisplay(row.bidAmount ?? row.price);
  }
  if (operation === 'royalty_paid') {
    return yoctoToNearDisplay(row.amount ?? row.creatorPayment);
  }
  if (operation === 'purchase_failed') {
    return yoctoToNearDisplay(
      extraString(row.extraData, 'attempted_price') ?? row.price
    );
  }
  if (operation === 'auction_created') {
    return yoctoToNearDisplay(row.reservePrice ?? row.price);
  }
  return yoctoToNearDisplay(
    row.price ?? row.amount ?? row.newPrice ?? row.bidAmount
  );
}

/**
 * One edition's timeline, newest first.
 * Price is omitted when that event had none.
 */
export function mapTokenHistoryRows(
  rows: readonly TokenHistoryEvent[]
): CollectionActivityRow[] {
  return [...rows].reverse().map((row, index) => {
    const operation = row.operation?.trim() || 'unknown';
    const eventType = row.eventType?.trim() || '';
    const at = timestampNumber(row.blockTimestamp);
    return {
      key: `${operation}:${row.blockHeight ?? 0}:${index}`,
      operation,
      label: historyLabel(operation, eventType),
      actor: historyActor(row, operation),
      time: formatMarketRelativeTime(at) ?? '',
      timeTitle: at > 0 ? formatPostTimestamp(at) : undefined,
      priceNear: historyPrice(row, operation),
    };
  });
}
