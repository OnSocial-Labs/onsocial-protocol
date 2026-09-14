'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { BoostNetworkPulse } from '@/features/boost/boost-network-pulse';
import { BoostPageColumn } from '@/features/boost/boost-page-column';
import { BoostPageIntro } from '@/features/boost/boost-page-intro';
import { OpenBoostInAppLink } from '@/features/boost/open-boost-in-app';
import { fetchActiveBoosterCount } from '@/lib/boost-network';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { BoostContractStats } from '@onsocial/sdk';

const os = createPortalOnSocialClient();

export function BoostHandoffPage() {
  const [stats, setStats] = useState<BoostContractStats | null>(null);
  const [boosterCount, setBoosterCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      os.boost.getStats().catch(() => null),
      fetchActiveBoosterCount().catch(() => null),
    ])
      .then(([nextStats, nextCount]) => {
        if (cancelled) return;
        setStats(nextStats);
        setBoosterCount(nextCount);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell className="max-w-6xl">
      <BoostPageColumn>
        <div className="max-md:hidden">
          <BoostPageIntro />
        </div>

        <BoostNetworkPulse
          boosterCount={boosterCount}
          totalLockedYocto={stats?.total_locked ?? '0'}
          scheduledPoolYocto={stats?.scheduled_pool ?? '0'}
          activeWeeklyRateBps={stats?.active_weekly_rate_bps ?? null}
          loading={loading}
        />

        <SurfacePanel radius="xl" tone="soft" className="px-5 py-6 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lock, collect, and unlock live in OnSocial. This page is the network
            pulse.
          </p>
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <OpenBoostInAppLink>Open in OnSocial</OpenBoostInAppLink>
            </Button>
          </div>
        </SurfacePanel>
      </BoostPageColumn>
    </PageShell>
  );
}
