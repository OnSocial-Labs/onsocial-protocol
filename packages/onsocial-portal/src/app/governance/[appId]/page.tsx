'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { RouteLoadingShell } from '@/components/layout/route-loading-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  fetchGovernanceFeed,
  fetchGovernanceProposalBootstrap,
} from '@/features/governance/api';
import { GovernanceCard } from '@/features/governance/governance-card';
import { GovernanceCardSkeleton } from '@/features/governance/governance-card-sections';
import {
  mergeGovernanceFeedApplication,
  parseGovernanceProposalId,
  resolveGovernanceApplication,
  resolveGovernanceProposalId,
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

    const resolvedProposalId = resolveGovernanceProposalId(appId, proposalId);
    let bootstrapApp: Application | null = null;
    let bootstrapPolicy: GovernanceDaoPolicy | null = null;

    try {
      if (resolvedProposalId != null) {
        const bootstrap = await fetchGovernanceProposalBootstrap(
          appId,
          resolvedProposalId
        );
        if (bootstrap) {
          bootstrapApp = bootstrap.app;
          bootstrapPolicy = bootstrap.daoPolicy;
          setApp(bootstrapApp);
          setDaoPolicy(bootstrapPolicy);
          setLoading(false);
        }
      }

      const { applications, daoPolicy: feedDaoPolicy } =
        await fetchGovernanceFeed({
          onRevalidate: (freshFeed) => {
            const refreshed = resolveGovernanceApplication(
              freshFeed.applications,
              appId,
              resolvedProposalId ?? proposalId
            );
            if (refreshed) {
              setApp(
                bootstrapApp
                  ? mergeGovernanceFeedApplication(bootstrapApp, refreshed)
                  : refreshed
              );
              setDaoPolicy(freshFeed.daoPolicy ?? bootstrapPolicy);
            }
          },
        });
      const fromFeed = resolveGovernanceApplication(
        applications,
        appId,
        resolvedProposalId ?? proposalId
      );

      if (fromFeed) {
        setApp(
          bootstrapApp
            ? mergeGovernanceFeedApplication(bootstrapApp, fromFeed)
            : fromFeed
        );
        setDaoPolicy(feedDaoPolicy ?? bootstrapPolicy);
      } else if (!bootstrapApp) {
        setApp(null);
      }

      hasLoaded.current = true;
    } catch {
      if (!bootstrapApp) setError('Failed to load proposal.');
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
