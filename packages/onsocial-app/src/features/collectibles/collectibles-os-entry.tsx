'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CollectiblesLoadingScreen } from '@/features/collectibles/collectibles-loading-screen';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesQueryPath,
  collectiblesSeedParamsKey,
  type CollectiblesPageData,
  type CollectiblesPageQuery,
} from '@/lib/load-collectibles-page';

/**
 * OS Collectibles entry — when connected, paint the vault loading shell and
 * soft-redirect to `/@you/collectibles` so Launch See all and the launcher share
 * one held catalog. Do not return null on that hop — that was a blank beat.
 */
export function CollectiblesOsEntry({
  seedQuery = EMPTY_COLLECTIBLES_PAGE_QUERY,
  seedPromise = null,
}: {
  seedQuery?: CollectiblesPageQuery;
  seedPromise?: Promise<CollectiblesPageData> | null;
}) {
  const { accountId, isConnected } = useAppWallet();
  const router = useRouter();
  const seedKey = collectiblesSeedParamsKey(seedQuery);

  useEffect(() => {
    if (!isConnected || !accountId) return;
    router.replace(collectiblesQueryPath(accountId, seedQuery));
    // Key-only: preserve the discovery query without looping on a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey gates redirect
  }, [isConnected, accountId, router, seedKey]);

  if (isConnected && accountId) {
    return (
      <CollectiblesLoadingScreen
        pageAccountId={accountId}
        query={seedQuery}
      />
    );
  }

  return (
    <CollectiblesPagePanel
      seedQuery={seedQuery}
      seedPromise={seedPromise}
    />
  );
}
