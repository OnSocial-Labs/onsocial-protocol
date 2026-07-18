import type { NearWalletBase } from '@hot-labs/near-connect';
import type { OnSocial } from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/**
 * Wallet-broadcast OnSocial client for Scarces commerce.
 * Do not attach the core social session — its FunctionCall key receiver is
 * `core.onsocial.*`, and scarces txs target `scarces.onsocial.*`.
 *
 * Paid buys: `os.scarces.lazy.purchase(id, { depositYocto })` with this client.
 */
export function createAppScarcesWalletClient(
  accountId: string,
  wallet: NearWalletBase
): OnSocial {
  return createAppOnSocialClient(accountId, wallet);
}

function parseYoctoPrice(raw: unknown): string | null {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) {
    return String(raw);
  }
  if (raw && typeof raw === 'object') {
    const nested = (raw as { '0'?: string })['0'];
    if (typeof nested === 'string' && /^\d+$/.test(nested)) return nested;
  }
  return null;
}

export class LazyListingNotFoundError extends Error {
  readonly code = 'LAZY_LISTING_NOT_FOUND' as const;
  constructor(listingId: string) {
    super(`Listing ${listingId} is no longer available.`);
    this.name = 'LazyListingNotFoundError';
  }
}

/** Listing price in yoctoNEAR from the live contract, or null if missing. */
export async function fetchLazyListingPriceYocto(
  listingId: string
): Promise<string | null> {
  const record = await viewNearContract<{
    price?: unknown;
  } | null>(SCARCES_CONTRACT, 'get_lazy_listing', {
    listing_id: listingId,
  });
  if (!record) return null;
  return parseYoctoPrice(record.price);
}

/**
 * Resolve deposit for `os.scarces.lazy.purchase`. Throws if the listing is gone.
 */
export async function resolveLazyListingDepositYocto(
  listingId: string,
  fallbackDepositYocto?: string | null
): Promise<string> {
  const onChainPrice = await fetchLazyListingPriceYocto(listingId);
  if (onChainPrice == null) {
    throw new LazyListingNotFoundError(listingId);
  }
  if (onChainPrice !== '0') return onChainPrice;
  if (fallbackDepositYocto && /^\d+$/.test(fallbackDepositYocto)) {
    return fallbackDepositYocto;
  }
  throw new Error('Could not load listing price. Try again.');
}
