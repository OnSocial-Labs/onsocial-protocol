'use client';

import { useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { EndorsementSupportersPanel } from '@/features/profile/endorsement-supporters-panel';
import { useWallet } from '@/contexts/wallet-context';
import { useNavBack } from '@/hooks/use-nav-back';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import { humanizeEndorsementTopic } from '@/lib/endorsements';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { isEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
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

function readInitialQuery(raw: string | undefined): string {
  return raw?.trim() ?? '';
}

export default function EndorsementSupportersPage({
  accountId: accountIdParam,
  endorsementId: endorsementIdParam,
  issuer: issuerParam,
  target: targetParam,
  topic: topicParam,
  q: qParam,
}: {
  accountId: string;
  endorsementId?: string;
  issuer?: string;
  target?: string;
  topic?: string;
  q?: string;
}) {
  const { accountId: viewerAccountId } = useWallet();

  const pageAccountId = useMemo(
    () => decodeRouteAccountId(accountIdParam),
    [accountIdParam]
  );
  const endorsementId = useMemo(
    () => readSearchParam(endorsementIdParam) ?? '',
    [endorsementIdParam]
  );
  const topic = useMemo(() => readSearchParam(topicParam), [topicParam]);
  const issuer = useMemo(() => readSearchParam(issuerParam), [issuerParam]);
  const target = useMemo(() => readSearchParam(targetParam), [targetParam]);
  const initialQuery = useMemo(() => readInitialQuery(qParam), [qParam]);
  const topicLabel = humanizeEndorsementTopic(topic) || 'General';
  const isSelf = Boolean(
    pageAccountId && viewerAccountId && pageAccountId === viewerAccountId
  );
  const endorsementIdValid = isEndorsementSpendTargetId(endorsementId);

  useNavBack('Back');
  usePageNavBadge(
    formatProfilePageNavLabel({
      isSelf,
      accountId: pageAccountId,
      displayName: `Supporters · ${topicLabel}`,
      profileLoaded: true,
    }),
    'green'
  );

  if (!pageAccountId || !endorsementIdValid) {
    return (
      <PageShell size="standard">
        <p className="text-center text-sm text-muted-foreground">
          Supporter list not found.
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
          <EndorsementSupportersPanel
            key={`${pageAccountId}-${endorsementId}`}
            pageAccountId={pageAccountId}
            endorsementId={endorsementId}
            issuer={issuer}
            target={target}
            topic={topic}
            initialQuery={initialQuery}
            syncUrl
            viewerAccountId={viewerAccountId}
          />
        </div>
      </div>
    </PageShell>
  );
}
