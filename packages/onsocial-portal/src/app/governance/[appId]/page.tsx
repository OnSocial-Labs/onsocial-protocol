'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { RouteLoadingShell } from '@/components/layout/route-loading-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { fetchGovernanceFeed } from '@/features/governance/api';
import { GovernanceCard } from '@/features/governance/governance-card';
import { GovernanceCardSkeleton } from '@/features/governance/governance-card-sections';
import {
  parseGovernanceProposalId,
  resolveGovernanceApplication,
} from '@/features/governance/page-utils';
import type {
  Application,
  GovernanceDaoPolicy,
} from '@/features/governance/types';

function GovernanceProposalPageContent() {
  const params = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const appId = decodeURIComponent(params.appId);
  const proposalId = parseGovernanceProposalId(searchParams.get('proposal'));
  const [app, setApp] = useState<Application | null>(null);
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasLoaded = useRef(false);
  const { setNavBack } = useMobilePageContext();

  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  const loadApp = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    setError('');
    try {
      const { applications, daoPolicy: nextDaoPolicy } =
        await fetchGovernanceFeed();
      const found = resolveGovernanceApplication(applications, appId, proposalId);
      setApp(found);
      setDaoPolicy(nextDaoPolicy);
      hasLoaded.current = true;
    } catch {
      if (!hasLoaded.current) setError('Failed to load proposal.');
    } finally {
      setLoading(false);
    }
  }, [appId, proposalId]);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  return (
    <PageShell className="max-w-4xl">
      <SecondaryPageHeader badge="Proposal" badgeAccent="blue" />

      {error && (
        <p className="portal-red-panel portal-red-text rounded-[1rem] border px-4 py-3 text-center text-sm">
          {error}
        </p>
      )}

      {loading && !app && <GovernanceCardSkeleton />}

      {!loading && !error && !app && (
        <SurfacePanel
          radius="xl"
          tone="soft"
          className="py-12 text-center text-muted-foreground"
        >
          Proposal not found.
        </SurfacePanel>
      )}

      {app && (
        <GovernanceCard
          app={app}
          feedDaoPolicy={daoPolicy}
          onGovernanceUpdated={loadApp}
          interactive={false}
        />
      )}
    </PageShell>
  );
}

export default function GovernanceProposalPage() {
  return (
    <Suspense
      fallback={
        <RouteLoadingShell
          size="form"
          panelCount={1}
          panelMinHeights={['18rem']}
        />
      }
    >
      <GovernanceProposalPageContent />
    </Suspense>
  );
}
