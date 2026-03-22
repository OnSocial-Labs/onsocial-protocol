'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, XCircle } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { AppCard } from '@/features/admin/app-card';
import { fetchApplications } from '@/features/admin/api';
import { ADMIN_WALLETS } from '@/features/admin/constants';
import type { Application } from '@/features/admin/types';
import { useWallet } from '@/contexts/wallet-context';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';

export default function AdminPage() {
  const { accountId, wallet: walletInstance, connect } = useWallet();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected' | 'reopened'
  >('pending');

  const isAdmin = accountId && ADMIN_WALLETS.includes(accountId.toLowerCase());

  const loadApps = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchApplications(accountId);
      setApps(data);
    } catch {
      setError('Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (isAdmin) {
      loadApps();
    }
  }, [isAdmin, loadApps]);

  const filteredApps =
    filter === 'all' ? apps : apps.filter((app) => app.status === filter);
  const counts = {
    all: apps.length,
    pending: apps.filter((app) => app.status === 'pending').length,
    approved: apps.filter((app) => app.status === 'approved').length,
    rejected: apps.filter((app) => app.status === 'rejected').length,
    reopened: apps.filter((app) => app.status === 'reopened').length,
  };

  if (!accountId) {
    return (
      <PageShell className="max-w-3xl">
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 px-6 py-12 text-center">
          <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground/40" />
          <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em]">
            Admin Panel
          </h1>
          <p className="mb-6 text-muted-foreground">
            Connect your admin wallet to continue.
          </p>
          <Button
            onClick={() => connect()}
            size="lg"
            className="px-8 font-semibold"
          >
            Connect Wallet
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell className="max-w-3xl">
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 px-6 py-12 text-center">
          <XCircle className="portal-red-icon mx-auto mb-4 h-16 w-16" />
          <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em]">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            <span className="font-mono text-foreground">{accountId}</span> is not
            an admin wallet.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 px-2 py-4 md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 75% 25%, rgba(192,132,252,0.12), transparent 38%)',
          }}
        />
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Network: {ACTIVE_NEAR_NETWORK}
            </div>
            <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
              Review applications
              <br />
              <span className="portal-blue-text">Register trusted apps</span>
            </h1>
            <p className="text-base text-muted-foreground md:text-lg">
              Approve partners, register rules on-chain, and manage rollout status.
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

      <div className="mb-6 rounded-[1.5rem] border border-border/50 bg-background/30 p-4">
        <div className="flex max-w-xl gap-1 rounded-full border border-border/50 bg-muted/20 p-1">
          {(['pending', 'approved', 'rejected', 'reopened', 'all'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium capitalize transition-all ${
                filter === value
                  ? 'portal-blue-surface'
                  : 'portal-neutral-control'
              }`}
            >
              {value} ({counts[value]})
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="portal-blue-text flex min-h-[12rem] items-center justify-center rounded-[1.5rem] border border-border/50 bg-background/40">
          <PulsingDots size="lg" />
        </div>
      )}

      {!loading && filteredApps.length === 0 && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 py-12 text-center">
          <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            No {filter === 'all' ? '' : filter} applications.
          </p>
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {filteredApps.map((app) => (
            <AppCard
              key={app.app_id}
              app={app}
              wallet={accountId}
              walletInstance={walletInstance}
              onUpdate={loadApps}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}