'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import {
  NetworkPanel,
  type NetworkFilterKind,
} from '@/components/network-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/contexts/wallet-context';
import { useNavBack } from '@/hooks/use-nav-back';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import { cleanHandle } from '@/lib/endorsements';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import type { NetworkAccount } from '@/lib/profile-network-accounts';
import { fetchPortalProfileNetwork } from '@/lib/portal-profile-network-client';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

function decodeRouteAccountId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function readSearchParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

function parseNetworkFilter(value: string | undefined): NetworkFilterKind {
  if (value === 'mutual' || value === 'incoming' || value === 'outgoing') {
    return value;
  }
  return 'all';
}

async function fetchProfileMeta(accountId: string): Promise<{
  displayName: string;
  avatarUrl: string | null;
}> {
  const res = await fetch(
    `/api/profile?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await res.json().catch(() => null)) as {
    profile?: { name?: string | null } | null;
    avatarUrl?: string | null;
  } | null;

  return {
    displayName: body?.profile?.name?.trim() || cleanHandle(accountId),
    avatarUrl: body?.avatarUrl ?? null,
  };
}

export default function NetworkPage({
  accountId: accountIdParam,
  filter: filterParam,
  q: qParam,
}: {
  accountId: string;
  filter?: string;
  q?: string;
}) {
  const { accountId: viewerAccountId } = useWallet();

  const accountId = useMemo(
    () => decodeRouteAccountId(accountIdParam),
    [accountIdParam]
  );
  const initialFilter = useMemo(
    () => parseNetworkFilter(readSearchParam(filterParam)),
    [filterParam]
  );
  const initialQuery = useMemo(() => readSearchParam(qParam) ?? '', [qParam]);

  const isSelf = Boolean(
    accountId && viewerAccountId && accountId === viewerAccountId
  );

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<NetworkAccount[]>([]);
  const [totalCounts, setTotalCounts] = useState({
    incoming: 0,
    outgoing: 0,
    mutual: 0,
  });
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;
    setMetaLoaded(false);
    setGraphLoaded(false);
    setLoadError(null);
    setDisplayName(cleanHandle(accountId));
    setAvatarUrl(null);
    setAccounts([]);
    setTotalCounts({ incoming: 0, outgoing: 0, mutual: 0 });

    void Promise.all([
      fetchProfileMeta(accountId),
      fetchPortalProfileNetwork(
        { accountId, viewerAccountId },
        { skipMemoryCache: true }
      ),
    ])
      .then(([meta, network]) => {
        if (cancelled) return;
        setDisplayName(meta.displayName);
        setAvatarUrl(meta.avatarUrl);
        setAccounts(network.accounts);
        setTotalCounts(network.counts);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not load standing network.');
      })
      .finally(() => {
        if (!cancelled) {
          setMetaLoaded(true);
          setGraphLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, viewerAccountId]);

  useNavBack('Back');
  usePageNavBadge(
    formatProfilePageNavLabel({
      isSelf,
      accountId,
      displayName,
      profileLoaded: metaLoaded,
    }),
    'purple'
  );

  if (!accountId) {
    return (
      <PageShell size="standard">
        <p className="text-center text-sm text-muted-foreground">
          Network not found.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="form" className="flex min-h-0 flex-1 flex-col px-0">
      <div
        className={cn(
          'flex min-h-0 w-full min-w-0 flex-1 flex-col',
          profilePageMobileGutterClass
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col pb-6 md:pb-8',
            profilePageDiscoverColumnClass
          )}
        >
          {loadError ? (
            <p className="px-4 py-6 text-sm text-[var(--portal-red)] md:px-5">
              {loadError}
            </p>
          ) : null}

          {!metaLoaded || !graphLoaded ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <Skeleton className="mx-4 h-8 shrink-0 rounded-full bg-foreground/[0.06] md:mx-5" />
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 md:px-5">
                <Skeleton className="aspect-square w-full max-w-[min(460px,100%)] rounded-full bg-foreground/[0.04]" />
              </div>
            </div>
          ) : (
            <NetworkPanel
              key={accountId}
              variant="page"
              centerAccountId={accountId}
              centerAvatarUrl={avatarUrl}
              centerDisplayName={displayName}
              accounts={accounts}
              totalCounts={totalCounts}
              viewerAccountId={viewerAccountId}
              isSelf={isSelf}
              initialFilter={initialFilter}
              initialQuery={initialQuery}
              syncUrl
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}
