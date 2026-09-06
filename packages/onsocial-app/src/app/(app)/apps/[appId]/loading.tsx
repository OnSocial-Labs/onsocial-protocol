import { OsAppScreen } from '@/components/app/os-app-screen';
import { HubPageSkeleton } from '@/features/scarces/hub-page-skeleton';
import { APP_APPS_PATH } from '@/lib/app-routes';

export default function HubLoading() {
  return (
    <OsAppScreen title="Hub" dockBack backFallbackHref={APP_APPS_PATH} immersiveHeader>
      <HubPageSkeleton />
    </OsAppScreen>
  );
}
