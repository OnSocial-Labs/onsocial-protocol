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

export default function AdminPage() {
  const { accountId, wallet: walletInstance, connect } = useWallet();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'
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
  };

  if (!accountId) {
    return (
      <PageShell className="max-w-2xl text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
        <h1 className="text-3xl font-bold mb-4 tracking-[-0.03em]">
          Admin Panel
        </h1>
        <p className="text-muted-foreground mb-6">
          Connect your admin wallet to continue.
        </p>
        <Button
          onClick={() => connect()}
          size="lg"
          className="font-semibold px-8"
        >
          Connect Wallet
        </Button>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell className="max-w-2xl text-center">
        <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h1 className="text-3xl font-bold mb-4 tracking-[-0.03em]">
          Access Denied
        </h1>
        <p className="text-muted-foreground">
          <span className="font-mono text-foreground">{accountId}</span> is not
          an admin wallet.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">
            Partner Applications
          </h1>
          <Button onClick={loadApps} disabled={loading} size="sm" variant="outline">
            {loading ? <PulsingDots size="sm" /> : 'Refresh'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="text-[#4ADE80] font-mono">{accountId}</span> ·{' '}
          {apps.length} total applications
        </p>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </motion.div>

      <div className="flex gap-1 p-1 border border-border/50 rounded-full mb-6 max-w-md bg-muted/30">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors capitalize ${
              filter === value
                ? 'bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {value} ({counts[value]})
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-[#60A5FA]">
          <PulsingDots size="lg" />
        </div>
      )}

      {!loading && filteredApps.length === 0 && (
        <div className="text-center py-12 border border-border/50 rounded-2xl bg-muted/30">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
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