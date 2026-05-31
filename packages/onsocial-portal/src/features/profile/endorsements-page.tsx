'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { EndorsementsPagePanel } from '@/features/profile/endorsements-page-panel';
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
import {
  getPortalProfileUrl,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
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

function parseMode(value: string | undefined): PortalEndorsementsMode {
  return value === 'given' ? 'given' : 'received';
}

async function fetchProfileMeta(accountId: string): Promise<{
  displayName: string;
  avatarUrl: string | null;
  endorsementCounts: { received: number; given: number };
}> {
  const [profileRes, endorsementsRes] = await Promise.all([
    fetch(`/api/profile?accountId=${encodeURIComponent(accountId)}`, {
      cache: 'no-store',
    }),
    fetch(`/api/profile/endorsements?accountId=${encodeURIComponent(accountId)}`, {
      cache: 'no-store',
    }),
  ]);

  const body = (await profileRes.json().catch(() => null)) as {
    profile?: { name?: string | null } | null;
    avatarUrl?: string | null;
  } | null;
  const endorsementsBody = (await endorsementsRes.json().catch(() => null)) as {
    counts?: { received?: number; given?: number };
    received?: unknown[];
    given?: unknown[];
  } | null;

  const receivedList = endorsementsBody?.received ?? [];

  return {
    displayName: body?.profile?.name?.trim() || cleanHandle(accountId),
    avatarUrl: body?.avatarUrl ?? null,
    endorsementCounts: {
      received: Number(
        endorsementsBody?.counts?.received ?? receivedList.length
      ),
      given: Number(
        endorsementsBody?.counts?.given ?? endorsementsBody?.given?.length ?? 0
      ),
    },
  };
}

export default function EndorsementsPage({
  accountId: accountIdParam,
  mode: modeParam,
  topic: topicParam,
  issuer: issuerParam,
  target: targetParam,
}: {
  accountId: string;
  mode?: string;
  topic?: string;
  issuer?: string;
  target?: string;
}) {
  const router = useRouter();
  const { accountId: viewerAccountId } = useWallet();
  const profileState = useProfile();

  const accountId = useMemo(
    () => decodeRouteAccountId(accountIdParam),
    [accountIdParam]
  );
  const mode = parseMode(readSearchParam(modeParam));
  const initialTopic = readSearchParam(topicParam) ?? null;
  const initialFocus = useMemo(
    () =>
      readSearchParam(issuerParam)
        ? {
            issuer: readSearchParam(issuerParam),
            target: readSearchParam(targetParam) ?? accountId,
            topic: readSearchParam(topicParam),
          }
        : null,
    [accountId, issuerParam, targetParam, topicParam]
  );

  const isSelf = Boolean(
    accountId && viewerAccountId && accountId === viewerAccountId
  );

  const [displayName, setDisplayName] = useState(() => cleanHandle(accountId));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [endorsementCounts, setEndorsementCounts] = useState({
    received: 0,
    given: 0,
  });
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useNavBack('Back');
  usePageNavBadge(
    formatProfilePageNavLabel({
      isSelf,
      accountId,
      displayName,
      profileLoaded: metaLoaded,
    }),
    'gold'
  );

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;
    setMetaLoaded(false);
    setDisplayName(cleanHandle(accountId));

    void fetchProfileMeta(accountId)
      .then((meta) => {
        if (cancelled) return;
        setDisplayName(meta.displayName);
        setAvatarUrl(meta.avatarUrl);
        setEndorsementCounts(meta.endorsementCounts);
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayName(cleanHandle(accountId));
        setAvatarUrl(null);
      })
      .finally(() => {
        if (!cancelled) setMetaLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const navigateToProfile = useCallback(
    (targetAccountId: string) => {
      router.push(getPortalProfileUrl(targetAccountId));
    },
    [router]
  );

  const canEndorseBase = Boolean(
    viewerAccountId && accountId && !isSelf && profileState.endorse
  );

  if (!accountId) {
    return (
      <PageShell size="standard">
        <p className="text-center text-sm text-muted-foreground">
          Endorsements not found.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="form" className="px-0">
      <div className={cn('w-full min-w-0', profilePageMobileGutterClass)}>
        <div
          className={cn(
            'flex flex-col pb-12',
            profilePageDiscoverColumnClass
          )}
        >
          <EndorsementsPagePanel
            targetAccountId={accountId}
            targetDisplayName={displayName}
            targetAvatarUrl={avatarUrl}
            mode={mode}
            isSelf={isSelf}
            metaLoaded={metaLoaded}
            viewerAccountId={viewerAccountId}
            viewerAvatarUrl={profileState.avatarUrl}
            hasSocialSession={profileState.hasSocialSession}
            initialTopic={initialTopic}
            initialFocus={initialFocus}
            endorsementCounts={endorsementCounts}
            canEndorse={canEndorseBase}
            isSavingEndorsement={isSaving}
            onSelectAccount={navigateToProfile}
            onEndorse={
              profileState.endorse
                ? async (target, input) => {
                    setIsSaving(true);
                    try {
                      await profileState.endorse(target, input);
                    } finally {
                      setIsSaving(false);
                    }
                  }
                : undefined
            }
            onRemoveEndorsement={
              profileState.removeEndorsement
                ? async (target, topic) => {
                    setIsSaving(true);
                    try {
                      await profileState.removeEndorsement(target, topic);
                    } finally {
                      setIsSaving(false);
                    }
                  }
                : undefined
            }
          />
        </div>
      </div>
    </PageShell>
  );
}
