import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export interface CollectionRedeemAttendance {
  collectionId: string;
  minted: number;
  totalSupply: number;
  maxRedeems: number | null;
  /** Total redeem events across all tokens. */
  redeemedCount: number;
  /** Tokens that have used every allowed redeem. */
  fullyRedeemedCount: number;
}

function asNonNegInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Live collection redeem totals from `get_collection_stats`. */
export async function fetchCollectionRedeemAttendance(
  collectionId: string
): Promise<CollectionRedeemAttendance | null> {
  const id = collectionId.trim();
  if (!id) return null;
  try {
    const stats = await viewNearContract<{
      collection_id?: string;
      minted_count?: number;
      total_supply?: number;
      max_redeems?: number | null;
      redeemed_count?: number;
      fully_redeemed_count?: number;
    } | null>(SCARCES_CONTRACT, 'get_collection_stats', {
      collection_id: id,
    });
    if (!stats) return null;
    const maxRaw = stats.max_redeems;
    const maxRedeems =
      maxRaw == null || Number(maxRaw) <= 0 ? null : asNonNegInt(maxRaw);
    return {
      collectionId: stats.collection_id?.trim() || id,
      minted: asNonNegInt(stats.minted_count),
      totalSupply: asNonNegInt(stats.total_supply),
      maxRedeems,
      redeemedCount: asNonNegInt(stats.redeemed_count),
      fullyRedeemedCount: asNonNegInt(stats.fully_redeemed_count),
    };
  } catch {
    return null;
  }
}

/** One-line attendance for Door Admit / coupon Redeem staff pages. */
export function staffAttendanceLine(opts: {
  voice: PassStaffVoice;
  minted: number;
  redeemedCount: number;
  fullyRedeemedCount: number;
  maxRedeems: number | null;
}): string {
  const minted = Math.max(0, Math.floor(opts.minted));
  const fully = Math.min(
    minted,
    Math.max(0, Math.floor(opts.fullyRedeemedCount))
  );
  const redeems = Math.max(0, Math.floor(opts.redeemedCount));
  const max = opts.maxRedeems != null && opts.maxRedeems > 0 ? opts.maxRedeems : 1;
  const multi = max > 1;

  if (minted <= 0) {
    return opts.voice === 'redeem'
      ? 'No coupons minted yet'
      : 'No passes minted yet';
  }

  if (opts.voice === 'redeem') {
    if (multi) {
      return `${redeems} redeem${redeems === 1 ? '' : 's'} · ${fully} of ${minted} used up`;
    }
    return `Redeemed ${fully} of ${minted}`;
  }

  if (multi) {
    return `${redeems} check-in${redeems === 1 ? '' : 's'} · ${fully} of ${minted} fully in`;
  }
  return `Checked in ${fully} of ${minted}`;
}
