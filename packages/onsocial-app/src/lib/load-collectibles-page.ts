import {
  fetchOwnedScarcesPage,
  type OwnedScarcesPage,
} from '@/features/market/market-listings';

export type CollectiblesPageData = {
  /** First owned page when a wallet account is known server-side. */
  holdings: OwnedScarcesPage | null;
  accountId: string | null;
};

/**
 * Collectibles vault is wallet-scoped. Without a server session account we
 * return an empty shell; the client paints from `owned-vault-cache` when Market
 * / portfolio already warmed the first page.
 */
export async function loadCollectiblesPageData(
  accountId?: string | null
): Promise<CollectiblesPageData> {
  const owner = accountId?.trim() || null;
  if (!owner) {
    return { holdings: null, accountId: null };
  }
  try {
    const holdings = await fetchOwnedScarcesPage(owner, {
      pageSize: 24,
      bypassCache: true,
    });
    return { holdings, accountId: owner };
  } catch {
    return { holdings: null, accountId: owner };
  }
}
