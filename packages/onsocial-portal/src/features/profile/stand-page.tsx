'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { StandPagePanel } from '@/features/profile/stand-page-panel';
import { useProfile } from '@/contexts/profile-context';
import { useWallet } from '@/contexts/wallet-context';
import { useNavBack } from '@/hooks/use-nav-back';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import { cleanHandle } from '@/lib/endorsements';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { type PortalStandKind } from '@/lib/portal-config';
import { type StanceDetailKind } from '@/lib/profile-social-standings';
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

function parseStandKind(
  raw: string | string[] | undefined
): StanceDetailKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'incoming' || value === 'outgoing' || value === 'mutual') {
    return value;
  }
  return null;
}

async function fetchProfileMeta(accountId: string): Promise<{
  displayName: string;
  counts: { incoming: number; outgoing: number; mutual: number };
}> {
  const [profileRes, socialRes] = await Promise.all([
    fetch(`/api/profile?accountId=${encodeURIComponent(accountId)}`, {
      cache: 'no-store',
    }),
    fetch(`/api/profile/social?accountId=${encodeURIComponent(accountId)}`, {
      cache: 'no-store',
    }),
  ]);

  const profileBody = (await profileRes.json().catch(() => null)) as {
    profile?: { name?: string | null } | null;
  } | null;
  const socialBody = (await socialRes.json().catch(() => null)) as {
    counts?: { incoming?: number; outgoing?: number; mutual?: number };
  } | null;

  const name = profileBody?.profile?.name?.trim();
  return {
    displayName: name || cleanHandle(accountId),
    counts: {
      incoming: Number(socialBody?.counts?.incoming ?? 0),
      outgoing: Number(socialBody?.counts?.outgoing ?? 0),
      mutual: Number(socialBody?.counts?.mutual ?? 0),
    },
  };
}

export default function StandPage({
  accountId: accountIdParam,
  kind: kindParam,
}: {
  accountId: string;
  kind: PortalStandKind;
}) {
  const { accountId: viewerAccountId } = useWallet();
  const profileState = useProfile();

  const accountId = useMemo(
    () => decodeRouteAccountId(accountIdParam),
    [accountIdParam]
  );
  const kind = useMemo(() => parseStandKind(kindParam), [kindParam]);
  const isSelf = Boolean(
    accountId && viewerAccountId && accountId === viewerAccountId
  );

  const [displayName, setDisplayName] = useState(() => cleanHandle(accountId));
  const [counts, setCounts] = useState({
    incoming: 0,
    outgoing: 0,
    mutual: 0,
  });
  const [metaLoaded, setMetaLoaded] = useState(false);

  useNavBack('Back');
  usePageNavBadge(
    formatProfilePageNavLabel({
      isSelf,
      accountId,
      displayName,
      profileLoaded: metaLoaded,
    }),
    'blue'
  );

  useEffect(() => {
    if (!accountId || !kind) return;

    let cancelled = false;
    setMetaLoaded(false);
    setDisplayName(cleanHandle(accountId));

    void fetchProfileMeta(accountId)
      .then((meta) => {
        if (cancelled) return;
        setDisplayName(meta.displayName);
        setCounts(meta.counts);
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayName(cleanHandle(accountId));
      })
      .finally(() => {
        if (!cancelled) setMetaLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, kind]);

  if (!accountId || !kind) {
    return (
      <PageShell size="standard">
        <p className="text-center text-sm text-muted-foreground">
          Standing list not found.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="form" className="px-0">
      <div className={cn('w-full min-w-0', profilePageMobileGutterClass)}>
        <div
          className={cn('flex flex-col pb-12', profilePageDiscoverColumnClass)}
        >
          <StandPagePanel
            kind={kind}
            accountId={accountId}
            displayName={displayName}
            isSelf={isSelf}
            counts={counts}
            metaLoaded={metaLoaded}
            viewerAccountId={viewerAccountId}
            hasSocialSession={profileState.hasSocialSession}
            onUpdateAccountStanding={
              viewerAccountId
                ? async (account, shouldStand) => {
                    await profileState.updateStanding(
                      account.accountId,
                      shouldStand
                    );
                  }
                : undefined
            }
          />
        </div>
      </div>
    </PageShell>
  );
}
