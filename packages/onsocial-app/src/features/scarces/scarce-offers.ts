import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
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

/** Per-token rollup from open offers catalog (or empty if none). */
export interface TokenOfferSummary {
  tokenId: string;
  offerCount: number;
  highestAmountYocto: string;
  highestAmountNear: string;
}

/** Viewer’s open token offer. Market “Your offers” is delisted-only. */
export interface MyOpenTokenOffer {
  tokenId: string;
  amountYocto: string;
  amountNear: string;
  expiresAtNs: number | null;
}

/** Null until the viewer’s offer query has settled — never guess Make vs Update. */
export type ViewerOfferCta = 'make' | 'update';

export function viewerOfferCta(
  ready: boolean,
  hasOpenOffer: boolean
): ViewerOfferCta | null {
  if (!ready) return null;
  return hasOpenOffer ? 'update' : 'make';
}

export function viewerOfferCtaLabel(
  cta: ViewerOfferCta,
  surface: 'buy' | 'offer' = 'offer'
): string {
  if (cta === 'update') return 'Update offer';
  return surface === 'buy' ? 'Make an offer' : 'Make offer';
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

function sortOffersByAmount(offers: ScarceTokenOffer[]): ScarceTokenOffer[] {
  return [...offers].sort((a, b) => {
    const diff = BigInt(b.amountYocto) - BigInt(a.amountYocto);
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return b.createdAtNs - a.createdAtNs;
  });
}

function isExpired(expiresAtNs: number | null, nowNs: number): boolean {
  return expiresAtNs != null && expiresAtNs > 0 && expiresAtNs <= nowNs;
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
    if (isExpired(expiresAtNs, Date.now() * 1_000_000)) {
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

async function fetchOffersForTokenViaCatalog(
  tokenId: string
): Promise<ScarceTokenOffer[] | null> {
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeOffers({
      tokenId,
      kind: 'token',
      limit: 50,
    });
    const nowNs = Date.now() * 1_000_000;
    const offers = rows
      .filter((row) => row.buyerId?.trim() && row.amount?.trim())
      .filter((row) => !isExpired(row.expiresAt, nowNs))
      .map((row) => ({
        buyerId: row.buyerId.trim(),
        amountYocto: row.amount,
        amountNear: yoctoToNear(row.amount),
        expiresAtNs: row.expiresAt && row.expiresAt > 0 ? row.expiresAt : null,
        createdAtNs: row.createdBlockTimestamp || 0,
      }));
    return sortOffersByAmount(offers);
  } catch {
    return null;
  }
}

async function fetchOffersForTokenViaRpc(
  tokenId: string
): Promise<ScarceTokenOffer[]> {
  try {
    const rows = await viewNearContract<unknown[]>(
      SCARCES_CONTRACT,
      'get_offers_for_token',
      { token_id: tokenId, from_index: 0, limit: 50 }
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
      if (isExpired(expiresAtNs, nowNs)) continue;
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
    return sortOffersByAmount(offers);
  } catch {
    return [];
  }
}

/**
 * Open offers on a token — prefers sink `scarces_active_offers`, falls back
 * to contract `get_offers_for_token`. Accept still verifies on-chain.
 */
export async function fetchOffersForToken(
  tokenId: string
): Promise<ScarceTokenOffer[]> {
  const id = tokenId.trim();
  if (!id) return [];

  const catalog = await fetchOffersForTokenViaCatalog(id);
  if (catalog != null) {
    return catalog;
  }
  return fetchOffersForTokenViaRpc(id);
}

function summarizeOffersForToken(
  tokenId: string,
  offers: ScarceTokenOffer[]
): TokenOfferSummary | null {
  if (offers.length === 0) return null;
  const sorted = sortOffersByAmount(offers);
  const top = sorted[0]!;
  return {
    tokenId,
    offerCount: offers.length,
    highestAmountYocto: top.amountYocto,
    highestAmountNear: top.amountNear,
  };
}

/**
 * Batch highest-offer / count for many tokens via one catalog query.
 * Missing tokens simply omit a map entry. On catalog failure returns empty map
 * (callers keep rendering without badges).
 */
export async function fetchOfferSummariesByTokenIds(
  tokenIds: string[]
): Promise<Map<string, TokenOfferSummary> | null> {
  const unique = [...new Set(tokenIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, TokenOfferSummary>();
  if (unique.length === 0) return out;

  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeOffers({
      tokenIds: unique,
      kind: 'token',
      limit: Math.min(500, unique.length * 20),
    });
    const nowNs = Date.now() * 1_000_000;
    const byToken = new Map<string, ScarceTokenOffer[]>();
    for (const row of rows) {
      const tokenId = row.tokenId?.trim() ?? '';
      const buyerId = row.buyerId?.trim() ?? '';
      const amount = row.amount?.trim() ?? '';
      if (!tokenId || !buyerId || !amount) continue;
      if (isExpired(row.expiresAt, nowNs)) continue;
      const list = byToken.get(tokenId) ?? [];
      list.push({
        buyerId,
        amountYocto: amount,
        amountNear: yoctoToNear(amount),
        expiresAtNs: row.expiresAt && row.expiresAt > 0 ? row.expiresAt : null,
        createdAtNs: row.createdBlockTimestamp || 0,
      });
      byToken.set(tokenId, list);
    }
    for (const [tokenId, offers] of byToken) {
      const summary = summarizeOffersForToken(tokenId, offers);
      if (summary) out.set(tokenId, summary);
    }
    return out;
  } catch {
    // Keep the last badges — a catalog blip must not flash Offers away.
    return null;
  }
}

/** Open token offers placed by the viewer (catalog). */
export async function fetchMyOpenTokenOffers(
  buyerId: string
): Promise<MyOpenTokenOffer[] | null> {
  const buyer = buyerId.trim();
  if (!buyer) return [];
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeOffers({
      buyerId: buyer,
      kind: 'token',
      limit: 50,
    });
    const nowNs = Date.now() * 1_000_000;
    return rows
      .filter((row) => row.tokenId?.trim() && row.amount?.trim())
      .filter((row) => !isExpired(row.expiresAt, nowNs))
      .map((row) => ({
        tokenId: row.tokenId!.trim(),
        amountYocto: row.amount,
        amountNear: yoctoToNear(row.amount),
        expiresAtNs: row.expiresAt && row.expiresAt > 0 ? row.expiresAt : null,
      }))
      .sort((a, b) => {
        const diff = BigInt(b.amountYocto) - BigInt(a.amountYocto);
        if (diff > 0n) return 1;
        if (diff < 0n) return -1;
        return 0;
      });
  } catch {
    return null;
  }
}

/** Bids that still have a live listing use Buy / Bid — not this inbox. */
export function offersWithoutLiveListing(
  offers: MyOpenTokenOffer[],
  liveListingTokenIds: ReadonlySet<string>
): MyOpenTokenOffer[] {
  return offers.filter((offer) => !liveListingTokenIds.has(offer.tokenId));
}

/** Native / auction listings still on the book for these tokens. */
export async function fetchLiveListingTokenIds(
  tokenIds: string[]
): Promise<Set<string> | null> {
  const unique = [...new Set(tokenIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.scarces.activeListings({
      tokenIds: unique,
      kinds: ['native', 'auction'],
      limit: unique.length,
    });
    const out = new Set<string>();
    for (const row of rows) {
      const tokenId = row.tokenId?.trim();
      if (tokenId) out.add(tokenId);
    }
    return out;
  } catch {
    return null;
  }
}

export async function fetchTokenOwnerId(
  tokenId: string
): Promise<string | null> {
  const id = tokenId.trim();
  if (!id) return null;
  try {
    const raw = await viewNearContract<{ owner_id?: string } | null>(
      SCARCES_CONTRACT,
      'nft_token',
      { token_id: id }
    );
    return raw?.owner_id?.trim() || null;
  } catch {
    return null;
  }
}
