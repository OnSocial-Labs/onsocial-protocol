'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectiblesPlaySkeleton } from '@/features/collectibles/collectibles-play-skeleton';
import { collectiblesPlayBackHref } from '@/features/collectibles/collectibles-play-view';
import { PLAY_LOADING_PAGE_CLASS } from '@/lib/os-chrome-page';

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
      <div className={PLAY_LOADING_PAGE_CLASS}>
        <CollectiblesPlaySkeleton />
      </div>
    </OsAppScreen>
  );
}
