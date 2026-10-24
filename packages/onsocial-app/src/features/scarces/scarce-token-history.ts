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
  quantity?: number | null;
  /** Indexer id, `receipt-logIndex-TYPE-operation`, for order inside one block. */
  id?: string | null;
  extraData?: string | null;
}

/** Plumbing. A buy already shows the price. These are not the edition's life. */
export const TOKEN_HISTORY_OMIT_OPERATIONS = [
  'royalty_paid',
  'purchase_failed',
  'approval_granted',
  'approval_revoked',
  'all_approvals_revoked',
] as const;

const HIDDEN_OPERATIONS = new Set<string>(TOKEN_HISTORY_OMIT_OPERATIONS);

const EVENT_FAMILIES =
  'SCARCE_UPDATE|COLLECTION_UPDATE|LAZY_LISTING_UPDATE|OFFER_UPDATE|APP_POOL_UPDATE|STORAGE_UPDATE|CONTRACT_UPDATE';

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

function extraRecord(
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

function extraString(
  extraData: string | null | undefined,
  key: string
): string | null {
  const value = extraRecord(extraData)?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extraStringArray(
  extraData: string | null | undefined,
  key: string
): string[] {
  const value = extraRecord(extraData)?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
}

/** Log index baked into the indexer id. Missing ids sort as 0. */
export function tokenHistoryLogIndex(id: string | null | undefined): number {
  if (!id) return 0;
  const match = id.match(new RegExp(`-(\\d+)-(?:${EVENT_FAMILIES})-`));
  if (!match) return 0;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : 0;
}

/**
 * This edition's price in yocto.
 * A parallel `prices` list wins. A batch mint uses `unit_price`, or the
 * total divided by the quantity.
 */
export function tokenHistoryEditionYocto(
  row: TokenHistoryEvent,
  tokenId?: string
): string | null {
  const id = tokenId?.trim();
  const ids = extraStringArray(row.extraData, 'token_ids');
  const prices = extraStringArray(row.extraData, 'prices');
  if (id && ids.length > 0 && prices.length === ids.length) {
    const index = ids.indexOf(id);
    const picked = index >= 0 ? prices[index] : null;
    if (picked && /^\d+$/.test(picked)) return picked;
  }
  const unit = extraString(row.extraData, 'unit_price');
  if (unit && /^\d+$/.test(unit)) return unit;
  const total = row.price ?? row.amount ?? null;
  const quantity = row.quantity;
  if (
    quantity != null &&
    Number.isInteger(quantity) &&
    quantity > 1 &&
    total &&
    /^\d+$/.test(total)
  ) {
    return (BigInt(total) / BigInt(quantity)).toString();
  }
  return total;
}

function parallelAccount(
  row: TokenHistoryEvent,
  tokenId: string | undefined,
  key: string
): string | null {
  const id = tokenId?.trim();
  if (!id) return null;
  const ids = extraStringArray(row.extraData, 'token_ids');
  const people = extraStringArray(row.extraData, key);
  if (ids.length === 0 || people.length !== ids.length) return null;
  const index = ids.indexOf(id);
  return index >= 0 ? account(people[index]) : null;
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
      ? operation.charAt(0).toUpperCase() +
        operation.slice(1).replace(/_/g, ' ')
      : 'Updated')
  );
}

function historyActor(
  row: TokenHistoryEvent,
  operation: string,
  tokenId?: string
): string | null {
  switch (operation) {
    case 'transfer':
      return firstAccount(
        extraString(row.extraData, 'old_owner_id'),
        extraString(row.extraData, 'sender_id'),
        row.author
      );
    case 'purchase':
    case 'purchased':
    case 'offer_accepted':
    case 'collection_offer_accepted':
      return firstAccount(row.buyerId, row.ownerId, row.author);
    case 'creator_mint':
      return firstAccount(
        extraString(row.extraData, 'receiver_id'),
        row.author
      );
    case 'airdrop':
      return firstAccount(
        parallelAccount(row, tokenId, 'receivers'),
        row.author
      );
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
  operation: string,
  tokenId?: string
): string | null {
  if (NO_PRICE.has(operation)) return null;
  if (operation === 'update_price' || operation === 'price_updated') {
    return yoctoToNearDisplay(row.newPrice ?? row.price);
  }
  if (operation === 'auction_bid') {
    return yoctoToNearDisplay(row.bidAmount ?? row.price);
  }
  if (operation === 'auction_created') {
    return yoctoToNearDisplay(row.reservePrice ?? row.price);
  }
  if (
    operation === 'purchase' ||
    operation === 'purchased' ||
    operation === 'list' ||
    operation === 'list_native' ||
    operation === 'creator_mint' ||
    operation === 'airdrop'
  ) {
    return yoctoToNearDisplay(tokenHistoryEditionYocto(row, tokenId));
  }
  return yoctoToNearDisplay(
    row.price ?? row.amount ?? row.newPrice ?? row.bidAmount
  );
}

function historyBatchQuantity(row: TokenHistoryEvent): number | null {
  if (
    row.quantity != null &&
    Number.isInteger(row.quantity) &&
    row.quantity > 0
  ) {
    return row.quantity;
  }
  const ids = extraStringArray(row.extraData, 'token_ids');
  return ids.length > 1 ? ids.length : null;
}

/** True when every copy in the batch carried the same price. */
function historyBatchUniform(
  row: TokenHistoryEvent,
  quantity: number | null
): boolean {
  if (quantity == null || quantity <= 1) return false;
  const unit = extraString(row.extraData, 'unit_price');
  if (unit && /^\d+$/.test(unit)) return true;
  const prices = extraStringArray(row.extraData, 'prices');
  if (prices.length > 1) return prices.every((price) => price === prices[0]);
  const total = row.price ?? row.amount;
  return Boolean(total && /^\d+$/.test(total));
}

/**
 * One edition's timeline, newest first.
 * Inside one block, the later log stays above the earlier one.
 * Price is omitted when that event had none.
 * Royalty, a failed purchase, and approvals are left out.
 */
export function mapTokenHistoryRows(
  rows: readonly TokenHistoryEvent[],
  tokenId?: string
): CollectionActivityRow[] {
  return rows
    .filter((row) => !HIDDEN_OPERATIONS.has(row.operation?.trim() || ''))
    .slice()
    .sort((a, b) => {
      const height = (b.blockHeight ?? 0) - (a.blockHeight ?? 0);
      if (height !== 0) return height;
      const log = tokenHistoryLogIndex(b.id) - tokenHistoryLogIndex(a.id);
      if (log !== 0) return log;
      return (
        timestampNumber(b.blockTimestamp) - timestampNumber(a.blockTimestamp)
      );
    })
    .map((row, index) => {
      const operation = row.operation?.trim() || 'unknown';
      const eventType = row.eventType?.trim() || '';
      const at = timestampNumber(row.blockTimestamp);
      const id = row.id?.trim();
      const quantity = historyBatchQuantity(row);
      return {
        key: id || `${operation}:${row.blockHeight ?? 0}:${index}`,
        operation,
        label: historyLabel(operation, eventType),
        actor: historyActor(row, operation, tokenId),
        time: formatMarketRelativeTime(at) ?? '',
        timeTitle: at > 0 ? formatPostTimestamp(at) : undefined,
        priceNear: historyPrice(row, operation, tokenId),
        quantity,
        uniformBatch: historyBatchUniform(row, quantity),
      };
    });
}
