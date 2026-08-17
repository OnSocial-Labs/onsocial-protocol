'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';

/**
 * OS Collectibles entry — when connected, soft-redirect to `/@you/collectibles`
 * so Launch See all and the launcher share one held catalog.
 */
export function CollectiblesOsEntry({
  initialAccountId = null,
  initialHoldings = null,
}: {
  initialAccountId?: string | null;
  initialHoldings?: {
    items: import('@/features/market/market-listings').OwnedScarceItem[];
    nextFromEnd: number;
    hasMore: boolean;
  } | null;
}) {
  const { accountId, isConnected } = useAppWallet();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected || !accountId) return;
    router.replace(portfolioCollectiblesPath(accountId));
  }, [isConnected, accountId, router]);

  if (isConnected && accountId) {
    return null;
  }

  return (
    <CollectiblesPagePanel
      initialAccountId={initialAccountId}
      initialHoldings={initialHoldings}
    />
  );
}
