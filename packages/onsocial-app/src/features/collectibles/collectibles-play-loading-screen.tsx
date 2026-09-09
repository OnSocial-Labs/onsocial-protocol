'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectiblesPlaySkeleton } from '@/features/collectibles/collectibles-play-skeleton';
import { collectiblesPlayBackHref } from '@/features/collectibles/collectibles-play-view';

/** Full-screen immersive player shell for route loading + Suspense. */
export function CollectiblesPlayLoadingScreen() {
  const { accountId } = useAppWallet();
  return (
    <OsAppScreen
      title="Player"
      dockBack
      backFallbackHref={collectiblesPlayBackHref(accountId)}
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <div className="market-page collectibles-play-page is-immersive">
        <CollectiblesPlaySkeleton />
      </div>
    </OsAppScreen>
  );
}
