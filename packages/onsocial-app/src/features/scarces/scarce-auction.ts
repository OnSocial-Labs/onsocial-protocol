import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export interface ScarceAuctionView {
  tokenId: string;
  sellerId: string;
  reservePriceYocto: string;
  minBidIncrementYocto: string;
  highestBidYocto: string;
  highestBidder: string | null;
  bidCount: number;
  expiresAtNs: number | null;
  buyNowPriceYocto: string | null;
  isEnded: boolean;
  reserveMet: boolean;
}

function u128Field(raw: unknown): string | null {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { '0'?: string })['0'] === 'string' &&
    /^\d+$/.test((raw as { '0': string })['0'])
  ) {
    return (raw as { '0': string })['0'];
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Minimum next bid in yocto — mirrors `place_bid` in scarces-onsocial. */
export function minNextBidYocto(view: ScarceAuctionView): bigint {
  const highest = BigInt(view.highestBidYocto || '0');
  const reserve = BigInt(view.reservePriceYocto || '0');
  const increment = BigInt(view.minBidIncrementYocto || '0');
  if (highest === 0n) {
    return reserve > increment ? reserve : increment;
  }
  return highest + increment;
}

export function minNextBidNear(view: ScarceAuctionView): string {
  return yoctoToNear(minNextBidYocto(view).toString());
}

export function currentBidNear(view: ScarceAuctionView): string | null {
  const highest = BigInt(view.highestBidYocto || '0');
  if (highest === 0n) return null;
  return yoctoToNear(view.highestBidYocto);
}

export function buyNowNear(view: ScarceAuctionView): string | null {
  if (!view.buyNowPriceYocto) return null;
  const price = BigInt(view.buyNowPriceYocto);
  if (price <= 0n) return null;
  return yoctoToNear(view.buyNowPriceYocto);
}

/** Human countdown from auction `expires_at` (ns). Null when clock not started. */
export function formatAuctionCountdown(
  expiresAtNs: number | null,
  nowMs: number = Date.now()
): string | null {
  if (expiresAtNs == null || !Number.isFinite(expiresAtNs) || expiresAtNs <= 0) {
    return null;
  }
  const endsAtMs =
    expiresAtNs > 1e15
      ? Math.floor(expiresAtNs / 1e6)
      : expiresAtNs > 1e12
        ? expiresAtNs
        : expiresAtNs * 1000;
  const remainingMs = endsAtMs - nowMs;
  if (remainingMs <= 0) return 'Ended';
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export async function fetchScarceAuctionView(
  tokenId: string
): Promise<ScarceAuctionView | null> {
  const id = tokenId.trim();
  if (!id) return null;
  try {
    const raw = await viewNearContract<unknown>(
      SCARCES_CONTRACT,
      'get_auction',
      { token_id: id }
    );
    const record = asRecord(raw);
    if (!record) return null;
    const reserve = u128Field(record.reserve_price);
    const increment = u128Field(record.min_bid_increment);
    const highest = u128Field(record.highest_bid);
    if (!reserve || !increment || !highest) return null;
    const seller =
      typeof record.seller_id === 'string' ? record.seller_id.trim() : '';
    if (!seller) return null;
    const highestBidder =
      typeof record.highest_bidder === 'string' && record.highest_bidder.trim()
        ? record.highest_bidder.trim()
        : null;
    const expiresAt =
      typeof record.expires_at === 'number'
        ? record.expires_at
        : typeof record.expires_at === 'string' &&
            /^\d+$/.test(record.expires_at)
          ? Number(record.expires_at)
          : null;
    return {
      tokenId: id,
      sellerId: seller,
      reservePriceYocto: reserve,
      minBidIncrementYocto: increment,
      highestBidYocto: highest,
      highestBidder,
      bidCount: Number(record.bid_count) || 0,
      expiresAtNs: expiresAt,
      buyNowPriceYocto: u128Field(record.buy_now_price),
      isEnded: Boolean(record.is_ended),
      reserveMet: Boolean(record.reserve_met),
    };
  } catch {
    return null;
  }
}
