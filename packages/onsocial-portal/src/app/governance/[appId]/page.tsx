'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { RouteLoadingShell } from '@/components/layout/route-loading-shell';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
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

  const loadApp = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const apps = await fetchGovernanceFeed();
      const found = apps.find((a) => a.app_id === appId) ?? null;
      setApp(found);
    } catch {
      setError('Failed to load proposal.');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  return (
    <PageShell className="max-w-4xl">
      <Button variant="outline" size="sm" asChild className="mb-4">
        <Link href="/governance">
          <ArrowLeft className={`h-3.5 w-3.5 ${buttonArrowLeftClass}`} />
          All proposals
        </Link>
      </Button>

      {loading && (
        <RouteLoadingShell
          size="wide"
          panelCount={1}
          panelMinHeights={['16rem']}
        />
      )}

      {error && (
        <p className="portal-red-panel portal-red-text rounded-[1rem] border px-4 py-3 text-center text-sm">
          {error}
        </p>
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
