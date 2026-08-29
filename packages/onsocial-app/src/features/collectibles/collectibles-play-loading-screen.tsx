import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesPlaySkeleton } from '@/features/collectibles/collectibles-play-skeleton';
import { APP_COLLECTIBLES_PATH } from '@/lib/app-routes';

/** Full-screen immersive player shell for route loading + Suspense. */
export function CollectiblesPlayLoadingScreen() {
  return (
    <OsAppScreen
      title="Player"
      dockBack
      backFallbackHref={APP_COLLECTIBLES_PATH}
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <div className="market-page collectibles-play-page is-immersive">
        <CollectiblesPlaySkeleton />
      </div>
    </OsAppScreen>
  );
}
