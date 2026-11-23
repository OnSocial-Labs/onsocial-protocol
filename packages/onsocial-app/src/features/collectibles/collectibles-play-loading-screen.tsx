'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsHeaderBack } from '@/components/app/os-header-back';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectiblesPlaySkeleton } from '@/features/collectibles/collectibles-play-skeleton';
import { collectiblesPlayBackHref } from '@/features/collectibles/collectibles-play-view';
import { useCatalogDockBack } from '@/hooks/use-catalog-dock-back';
import { PLAY_LOADING_PAGE_CLASS } from '@/lib/os-chrome-page';

/** Full-screen immersive player shell for route loading + Suspense. */
export function CollectiblesPlayLoadingScreen() {
  const { accountId } = useAppWallet();
  const backHref = collectiblesPlayBackHref(accountId);
  const onBack = useCatalogDockBack(backHref);
  return (
    <OsAppScreen
      title="Player"
      backFallbackHref={backHref}
      leading={<OsHeaderBack fallbackHref={backHref} onBack={onBack} />}
      dockBack={false}
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <div className={PLAY_LOADING_PAGE_CLASS}>
        <CollectiblesPlaySkeleton />
      </div>
    </OsAppScreen>
  );
}
