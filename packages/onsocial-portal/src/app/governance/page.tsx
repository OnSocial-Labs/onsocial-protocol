'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe2 } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { fetchGovernanceFeed } from '@/features/governance/api';
import { GovernanceCard } from '@/features/governance/governance-card';
import type { Application } from '@/features/governance/types';

export default function GovernancePage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchGovernanceFeed();
      setApps(data);
    } catch {
      setError('Failed to load governance queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  return (
    <PageShell className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 px-2 py-4 md:py-6"
      >
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
              Governance queue
              <br />
              <span className="portal-blue-text">Public app proposal feed</span>
            </h1>
            <p className="text-base text-muted-foreground md:text-lg">
              Track community app proposals, execution status, and approved
              integrations in one public place.
            </p>
          </div>
          <div className="self-start md:self-auto">
            <Button onClick={loadApps} disabled={loading} size="sm">
              {loading ? <PulsingDots size="sm" /> : 'Refresh'}
            </Button>
          </div>
        </div>
        {error && (
          <p className="portal-red-panel portal-red-text relative z-10 mt-3 rounded-2xl border px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </motion.div>

      {loading && (
        <div className="portal-blue-text flex min-h-[12rem] items-center justify-center rounded-[1.5rem] border border-border/50 bg-background/40">
          <PulsingDots size="lg" />
        </div>
      )}

      {!loading && apps.length === 0 && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 py-12 text-center text-muted-foreground">
          No governance items right now.
        </div>
      )}

      {!loading && apps.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-[1.25rem] border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
          <Globe2 className="h-4 w-4 portal-blue-icon" />
          This page is public. Proposal creation happens from the partner flow,
          and API key activation happens automatically after on-chain execution.
        </div>
      )}

      {!loading && apps.length > 0 && (
        <div className="space-y-4">
          {apps.map((app) => (
            <GovernanceCard key={app.app_id} app={app} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
