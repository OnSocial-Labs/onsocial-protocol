import { PageShell } from '@/components/layout/page-shell';
import { BoostNetworkPulse } from '@/features/boost/boost-network-pulse';
import { BoostPageColumn } from '@/features/boost/boost-page-column';
import { BoostPageIntro } from '@/features/boost/boost-page-intro';

export function BoostPageLoadingShell() {
  return (
    <PageShell className="max-w-6xl">
      <BoostPageColumn>
        <div className="max-md:hidden">
          <BoostPageIntro />
        </div>

        <BoostNetworkPulse
          boosterCount={null}
          totalLockedYocto="0"
          scheduledPoolYocto="0"
          activeWeeklyRateBps={null}
          loading
        />
      </BoostPageColumn>
    </PageShell>
  );
}
