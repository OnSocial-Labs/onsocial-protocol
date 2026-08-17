import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Normalize on-chain royalty map; empty object when known-none. */
function parseRoyaltyMap(
  raw: Record<string, number> | null | undefined
): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [accountId, value] of Object.entries(raw)) {
    const id = accountId.trim();
    const bps = Math.floor(Number(value));
    if (!id || !Number.isSafeInteger(bps) || bps <= 0) continue;
    out[id] = bps;
  }
  return out;
}

/**
 * Resale royalty for facts — edition truth first:
 * minted token → lazy listing → Drop collection.
 * Returns `null` when nothing could be resolved; `{}` when known with no cut.
 */
export async function fetchScarceRoyaltyMap(opts: {
  collectionId?: string | null;
  listingId?: string | null;
  tokenId?: string | null;
}): Promise<Record<string, number> | null> {
  const tokenId = opts.tokenId?.trim();
  if (tokenId) {
    try {
      const status = await viewNearContract<{
        royalty?: Record<string, number> | null;
      } | null>(SCARCES_CONTRACT, 'get_token_status', {
        token_id: tokenId,
      });
      if (status) return parseRoyaltyMap(status.royalty);
    } catch {
      /* fall through */
    }
  }

  const listingId = opts.listingId?.trim();
  if (listingId) {
    try {
      const record = await viewNearContract<{
        royalty?: Record<string, number> | null;
      } | null>(SCARCES_CONTRACT, 'get_lazy_listing', {
        listing_id: listingId,
      });
      if (record) return parseRoyaltyMap(record.royalty);
    } catch {
      /* fall through */
    }
  }

  const collectionId = opts.collectionId?.trim();
  if (collectionId) {
    const view = await fetchCollectionPreferIndexer(collectionId);
    if (view) return view.royalty ?? {};
  }

  return null;
}
