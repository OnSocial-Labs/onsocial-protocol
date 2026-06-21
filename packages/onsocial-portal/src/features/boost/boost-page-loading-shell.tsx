import { PageShell } from '@/components/layout/page-shell';
import { BoostCommitmentPanelSkeleton } from '@/features/boost/boost-commitment-panel-skeleton';
import { BoostPageColumn } from '@/features/boost/boost-page-column';
import { BoostPageIntro } from '@/features/boost/boost-page-intro';
import { BoostNetworkPulse } from '@/features/boost/boost-network-pulse';

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

        <BoostCommitmentPanelSkeleton />
      </BoostPageColumn>
    </PageShell>
  );
}
