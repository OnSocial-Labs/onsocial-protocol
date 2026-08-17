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
 * Held catalog for an account. Portfolio `/@id/collectibles` always passes the
 * page account; OS `/collectibles` may pass null (disconnected shell) until the
 * client soft-redirects to `/@you/collectibles`.
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
