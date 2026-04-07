'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { fetchGovernanceFeed } from '@/features/governance/api';
import { GovernanceCard } from '@/features/governance/governance-card';
import type { Application } from '@/features/governance/types';

export default function GovernanceProposalPage() {
  const params = useParams<{ appId: string }>();
  const appId = decodeURIComponent(params.appId);
  const [app, setApp] = useState<Application | null>(null);
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
      const apps = await fetchGovernanceFeed();
      const found = apps.find((a) => a.app_id === appId) ?? null;
      setApp(found);
      hasLoaded.current = true;
    } catch {
      if (!hasLoaded.current) setError('Failed to load proposal.');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  return (
    <PageShell className="max-w-4xl">
      <SecondaryPageHeader
        badge="Proposal"
        badgeAccent="blue"
      />

      {error && (
        <p className="portal-red-panel portal-red-text rounded-[1rem] border px-4 py-3 text-center text-sm">
          {error}
        </p>
      )}

      {loading && !app && (
        <SurfacePanel
          radius="xl"
          tone="solid"
          borderTone="strong"
          padding="roomy"
          className="animate-pulse"
        >
          <div className="h-4 w-2/5 rounded bg-muted-foreground/10" />
          <div className="mt-3 h-3 w-3/4 rounded bg-muted-foreground/10" />
          <div className="mt-6 h-3 w-1/2 rounded bg-muted-foreground/10" />
        </SurfacePanel>
      )}

      {!loading && !error && !app && (
        <SurfacePanel
          radius="xl"
          tone="soft"
          className="py-12 text-center text-muted-foreground"
        >
          Proposal not found.
        </SurfacePanel>
      )}

      {app && <GovernanceCard app={app} onGovernanceUpdated={loadApp} />}
    </PageShell>
  );
}
