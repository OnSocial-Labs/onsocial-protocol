import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export interface ScarceTokenOffer {
  buyerId: string;
  amountYocto: string;
  amountNear: string;
  expiresAtNs: number | null;
  createdAtNs: number;
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

export async function fetchOfferFromBuyer(
  tokenId: string,
  buyerId: string
): Promise<ScarceTokenOffer | null> {
  const id = tokenId.trim();
  const buyer = buyerId.trim();
  if (!id || !buyer) return null;
  try {
    const raw = await viewNearContract<unknown>(SCARCES_CONTRACT, 'get_offer', {
      token_id: id,
      buyer_id: buyer,
    });
    const record = asRecord(raw);
    if (!record) return null;
    const amountYocto = u128Field(record.amount);
    if (!amountYocto) return null;
    const expiresAtNs =
      typeof record.expires_at === 'number'
        ? record.expires_at
        : typeof record.expires_at === 'string' &&
            /^\d+$/.test(record.expires_at)
          ? Number(record.expires_at)
          : null;
    if (expiresAtNs != null && expiresAtNs <= Date.now() * 1_000_000) {
      return null;
    }
    const createdAtNs =
      typeof record.created_at === 'number'
        ? record.created_at
        : typeof record.created_at === 'string' &&
            /^\d+$/.test(record.created_at)
          ? Number(record.created_at)
          : 0;
    return {
      buyerId: buyer,
      amountYocto,
      amountNear: yoctoToNear(amountYocto),
      expiresAtNs,
      createdAtNs,
    };
  } catch {
    return null;
  }
}

export async function fetchOffersForToken(
  tokenId: string
): Promise<ScarceTokenOffer[]> {
  const id = tokenId.trim();
  if (!id) return [];
  try {
    const rows = await viewNearContract<unknown[]>(
      SCARCES_CONTRACT,
      'get_offers_for_token',
      { token_id: id, from_index: 0, limit: 50 }
    );
    if (!Array.isArray(rows)) return [];
    const nowNs = Date.now() * 1_000_000;
    const offers: ScarceTokenOffer[] = [];
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) continue;
      const buyerId =
        typeof record.buyer_id === 'string' ? record.buyer_id.trim() : '';
      const amountYocto = u128Field(record.amount);
      if (!buyerId || !amountYocto) continue;
      const expiresAtNs =
        typeof record.expires_at === 'number'
          ? record.expires_at
          : typeof record.expires_at === 'string' &&
              /^\d+$/.test(record.expires_at)
            ? Number(record.expires_at)
            : null;
      if (expiresAtNs != null && expiresAtNs <= nowNs) continue;
      const createdAtNs =
        typeof record.created_at === 'number'
          ? record.created_at
          : typeof record.created_at === 'string' &&
              /^\d+$/.test(record.created_at)
            ? Number(record.created_at)
            : 0;
      offers.push({
        buyerId,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        expiresAtNs,
        createdAtNs,
      });
    }
    offers.sort((a, b) => {
      const diff = BigInt(b.amountYocto) - BigInt(a.amountYocto);
      if (diff > 0n) return 1;
      if (diff < 0n) return -1;
      return b.createdAtNs - a.createdAtNs;
    });
    return offers;
  } catch {
    return [];
  }
}
