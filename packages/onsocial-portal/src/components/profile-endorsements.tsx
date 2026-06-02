'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  EndorsementRecord,
  endorsementListRowClass,
} from '@/components/ui/endorsement-flow';
import { portalCompactActionPillClass } from '@/components/ui/profile-action-pill';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { getPortalEndorsementsUrl } from '@/lib/portal-config';
import { EndorseModal } from './endorse-modal';
import {
  cleanHandle,
  endorsementTimestamp,
  formatEndorsementTime,
  humanizeEndorsementTopic,
  mergeEndorsementsAfterUpsert,
  normalizeEndorsementTopic,
  type EndorsementSubmitInput,
} from '@/lib/endorsements';
import type { EndorsementListItem } from '@onsocial/sdk';

type EndorsementItem = EndorsementListItem & {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

function formatCount(count: number): string {
  if (count < 1000) return String(count);
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: count < 100000 ? 1 : 0,
    notation: 'compact',
  }).format(count);
}

interface ProfileEndorsementsProps {
  accountId: string | null;
  viewerAccountId: string | null;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  selfAvatarUrl?: string | null;
  hasSocialSession?: boolean;
  onEndorse?: (
    target: string,
    input: EndorsementSubmitInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
  onEndorsementCountChange?: (count: number) => void;
  onGivenCountChange?: (count: number) => void;
}

export function ProfileEndorsements({
  accountId,
  viewerAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  selfAvatarUrl = null,
  hasSocialSession = false,
  onEndorse,
  onRemoveEndorsement,
  pageLayout = false,
  onSelectAccount,
  onEndorsementCountChange,
  onGivenCountChange,
}: ProfileEndorsementsProps) {
  const router = useRouter();
  const [endorsements, setEndorsements] = useState<EndorsementItem[]>([]);
  const [givenEndorsements, setGivenEndorsements] = useState<EndorsementItem[]>(
    []
  );
  const [endorsementCounts, setEndorsementCounts] = useState({
    received: 0,
    given: 0,
  });
  const [viewerToTargetEndorsements, setViewerToTargetEndorsements] = useState<
    EndorsementItem[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [endorseModalOpen, setEndorseModalOpen] = useState(false);
  const [myEndorsements, setMyEndorsements] = useState<EndorsementItem[]>([]);
  const [editingEndorsement, setEditingEndorsement] =
    useState<EndorsementItem | null>(null);

  const MAX_ENDORSEMENTS_PER_TARGET = 5;
  const isSelf = viewerAccountId === accountId;
  const atCap = myEndorsements.length >= MAX_ENDORSEMENTS_PER_TARGET;
  const canEndorse = Boolean(
    viewerAccountId && accountId && !isSelf && onEndorse
  );
  const canAddNew = canEndorse && !atCap;
  const endorseActionLabel = hasSocialSession ? 'Endorse' : 'Authorize';

  const loadEndorsements = useCallback(async () => {
    if (!accountId) return;

    setIsLoading(true);
    try {
      const search = new URLSearchParams({ accountId });
      if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);

      const res = await fetch(
        `/api/profile/endorsements?${search.toString()}`,
        {
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          counts?: { received?: number; given?: number };
          received?: EndorsementItem[];
          given?: EndorsementItem[];
          viewerToTarget?: EndorsementItem[];
        };
        const list = data.received ?? [];
        setEndorsements(list);
        setGivenEndorsements(data.given ?? []);
        setEndorsementCounts({
          received: Number(data.counts?.received ?? list.length),
          given: Number(data.counts?.given ?? data.given?.length ?? 0),
        });
        setViewerToTargetEndorsements(data.viewerToTarget ?? []);
        setMyEndorsements(data.viewerToTarget ?? []);
      }
    } catch {
      // Endorsements are a secondary profile signal; keep the profile usable.
    } finally {
      setIsLoading(false);
    }
  }, [accountId, viewerAccountId]);

  useEffect(() => {
    void loadEndorsements();
  }, [loadEndorsements]);

  useEffect(() => {
    onEndorsementCountChange?.(endorsementCounts.received);
  }, [endorsementCounts.received, onEndorsementCountChange]);

  const handleEndorseSubmit = async (input: EndorsementSubmitInput) => {
    if (!accountId) throw new Error('Profile account is not ready.');
    if (!viewerAccountId)
      throw new Error('Connect your wallet before endorsing.');
    if (!onEndorse)
      throw new Error('Endorsement writes are not available here.');

    setIsSaving(true);
    try {
      const { previousTopic, ...buildInput } = input;
      await onEndorse(accountId, input);
      const optimistic: EndorsementItem = {
        issuer: viewerAccountId,
        target: accountId,
        v: 1,
        since: Date.now(),
        topic: buildInput.topic,
        note: buildInput.note,
        expiresAt: buildInput.expiresAt,
        blockHeight: 0,
        blockTimestamp: Date.now(),
        issuerAvatarUrl: selfAvatarUrl,
        targetAvatarUrl,
      };
      setMyEndorsements((prev) =>
        mergeEndorsementsAfterUpsert(prev, {
          issuer: viewerAccountId,
          target: accountId,
          previousTopic,
          next: optimistic,
        })
      );
      setViewerToTargetEndorsements((prev) =>
        mergeEndorsementsAfterUpsert(prev, {
          issuer: viewerAccountId,
          target: accountId,
          previousTopic,
          next: optimistic,
        })
      );
      setEndorsements((current) =>
        mergeEndorsementsAfterUpsert(current, {
          issuer: viewerAccountId,
          target: accountId,
          previousTopic,
          next: optimistic,
        })
      );
      setEditingEndorsement(null);
      window.setTimeout(() => void loadEndorsements(), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (topic?: string) => {
    if (!accountId) throw new Error('Profile account is not ready.');
    if (!viewerAccountId) {
      throw new Error('Connect your wallet before removing an endorsement.');
    }
    if (!onRemoveEndorsement) {
      throw new Error('Endorsement removal is not available here.');
    }

    setIsSaving(true);
    try {
      await onRemoveEndorsement(accountId, topic);
      const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
      setMyEndorsements((prev) =>
        prev.filter(
          (item) =>
            normalizeEndorsementTopic(item.topic ?? '') !== normalizedTopic
        )
      );
      setViewerToTargetEndorsements((prev) =>
        prev.filter(
          (item) =>
            normalizeEndorsementTopic(item.topic ?? '') !== normalizedTopic
        )
      );
      setEndorsements((current) =>
        current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
            )
        )
      );
      setEditingEndorsement(null);
      window.setTimeout(() => void loadEndorsements(), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const rankedEndorsements = useMemo(() => {
    return [...endorsements].sort((a, b) => {
      const aIsMine = viewerAccountId ? a.issuer === viewerAccountId : false;
      const bIsMine = viewerAccountId ? b.issuer === viewerAccountId : false;
      if (aIsMine !== bIsMine) return aIsMine ? -1 : 1;
      return (b.blockTimestamp ?? 0) - (a.blockTimestamp ?? 0);
    });
  }, [endorsements, viewerAccountId]);

  const givenAccountCount = useMemo(() => {
    return new Set(givenEndorsements.map((item) => item.target)).size;
  }, [givenEndorsements]);
  const givenEndorsementCount = endorsementCounts.given;

  useEffect(() => {
    onGivenCountChange?.(givenEndorsementCount);
  }, [givenEndorsementCount, onGivenCountChange]);

  const givenSignalLabel =
    givenEndorsementCount === 1
      ? '1 endorsement'
      : `${formatCount(givenEndorsementCount)} endorsements`;
  const givenAccountLabel =
    givenAccountCount === 1
      ? '1 account'
      : `${formatCount(givenAccountCount)} accounts`;

  const PROFILE_SUMMARY_COUNT = 1;
  const visibleEndorsements = rankedEndorsements.slice(
    0,
    PROFILE_SUMMARY_COUNT
  );

  const openEndorsementsPage = useCallback(
    (options?: { issuer?: string; target?: string; topic?: string | null }) => {
      if (!accountId) return;
      router.push(
        getPortalEndorsementsUrl(accountId, {
          mode: 'received',
          issuer: options?.issuer,
          target: options?.target ?? accountId,
          topic: options?.topic,
        })
      );
    },
    [accountId, router]
  );

  const openEndorsementDetails = (endorsement: EndorsementItem) => {
    openEndorsementsPage({
      issuer: endorsement.issuer,
      target: endorsement.target,
      topic: endorsement.topic,
    });
  };

  const openAllEndorsements = () => {
    openEndorsementsPage();
  };

  return (
    <div className="mt-4" id="profile-endorsements">
      <div className="h-px divider-section" />

      <div className="pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="portal-eyebrow text-muted-foreground/55">
            {rankedEndorsements.length > 0
              ? 'Latest endorsement'
              : 'Endorsements'}
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            {endorsementCounts.received > 1 ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={openAllEndorsements}
                className="gap-1.5 px-2.5"
                aria-label={`View all ${formatCount(endorsementCounts.received)} endorsements`}
              >
                View all
                <ProtocolMotionArrow className="h-3 w-3" />
              </Button>
            ) : null}

            {canAddNew ? (
              <Button
                type="button"
                size="xs"
                variant="endorsement"
                onClick={() => {
                  setEditingEndorsement(null);
                  setEndorseModalOpen(true);
                }}
                aria-label={
                  hasSocialSession
                    ? `Endorse ${targetDisplayName}`
                    : `Authorize and endorse ${targetDisplayName}`
                }
              >
                {endorseActionLabel}
              </Button>
            ) : canEndorse && atCap ? (
              <span className="portal-type-label text-portal-neutral opacity-70">
                {MAX_ENDORSEMENTS_PER_TARGET} topics max
              </span>
            ) : isSelf ? (
              <span className="portal-type-label text-portal-neutral opacity-70">
                Others can endorse you
              </span>
            ) : !viewerAccountId ? (
              <span className="portal-type-label text-portal-neutral opacity-70">
                Connect to endorse
              </span>
            ) : null}
          </div>
        </div>

        {isLoading && endorsements.length === 0 ? (
          <div className="mt-3 space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 py-0.5 pl-2">
                <Skeleton className="h-4 w-24 bg-foreground/[0.08]" />
                <Skeleton className="h-3 w-full max-w-xs bg-foreground/5" />
                <Skeleton className="h-px w-full divider-detail bg-foreground/5" />
                <Skeleton className="h-3 w-40 bg-foreground/5" />
              </div>
            ))}
          </div>
        ) : visibleEndorsements.length > 0 ? (
          <div className="mt-3 space-y-3">
            {visibleEndorsements.map((e, index) => {
              const secondaryText = e.note?.trim();
              const timeLabel = formatEndorsementTime(endorsementTimestamp(e));
              const timeDescription = timeLabel
                ? `Endorsement ${timeLabel}`
                : undefined;

              const issuerAvatarUrl =
                e.issuerAvatarUrl ??
                (e.issuer === viewerAccountId ? selfAvatarUrl : null);
              const endorsementTargetAvatarUrl =
                e.targetAvatarUrl ??
                (e.target === accountId ? targetAvatarUrl : null);

              return (
                <div
                  key={`${e.issuer}:${e.topic ?? ''}:${e.blockHeight}:${index}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEndorsementDetails(e)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openEndorsementDetails(e);
                    }
                  }}
                  aria-label={`Endorsement from ${cleanHandle(e.issuer)} to ${cleanHandle(e.target)}`}
                  className={endorsementListRowClass}
                >
                  <EndorsementRecord
                    issuer={e.issuer}
                    target={e.target}
                    issuerName={e.issuerName}
                    targetName={
                      e.targetName ??
                      (e.target === accountId ? targetDisplayName : null)
                    }
                    issuerAvatarUrl={issuerAvatarUrl}
                    targetAvatarUrl={endorsementTargetAvatarUrl}
                    viewerAccountId={viewerAccountId}
                    topic={e.topic}
                    note={secondaryText}
                    noteClamp={2}
                    pageLayout={pageLayout}
                    onSelectAccount={pageLayout ? undefined : onSelectAccount}
                    timeLabel={
                      timeLabel ? (
                        <PortalHoverTooltip
                          className="text-right portal-type-caption tabular-nums text-muted-foreground/40"
                          aria-label={timeDescription}
                          stopPropagation
                          tooltip={timeDescription}
                        >
                          {timeLabel}
                        </PortalHoverTooltip>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 portal-type-body-sm text-muted-foreground/60">
            No endorsements yet.
          </div>
        )}

        {myEndorsements.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="portal-type-caption text-muted-foreground/45">
              You endorsed for
            </span>
            {myEndorsements.map((e) => (
              <button
                key={e.topic ?? ''}
                type="button"
                onClick={() => {
                  setEditingEndorsement(e);
                  setEndorseModalOpen(true);
                }}
                className={cn(
                  portalCompactActionPillClass,
                  'text-muted-foreground/70 hover:text-foreground'
                )}
              >
                {humanizeEndorsementTopic(e.topic) || 'General'}
              </button>
            ))}
          </div>
        ) : null}

        {givenEndorsementCount > 0 ? (
          <div className="mt-2 portal-type-label text-muted-foreground/50">
            {isSelf ? 'You gave' : 'They gave'}{' '}
            <span className="font-medium text-muted-foreground/70">
              {givenSignalLabel}
            </span>
            <span className="text-muted-foreground/40">
              {' '}
              to {givenAccountLabel}
            </span>
          </div>
        ) : null}
      </div>

      <EndorseModal
        key={`${accountId ?? ''}:${editingEndorsement?.issuer ?? 'new'}:${
          editingEndorsement?.topic ?? ''
        }`}
        open={endorseModalOpen}
        targetAccountId={accountId ?? ''}
        targetDisplayName={targetDisplayName}
        targetAvatarUrl={targetAvatarUrl}
        issuerAccountId={viewerAccountId}
        existing={
          editingEndorsement
            ? {
                topic: editingEndorsement.topic,
                note: editingEndorsement.note,
              }
            : null
        }
        existingTopics={myEndorsements
          .map((e) => normalizeEndorsementTopic(e.topic ?? ''))
          .filter(Boolean)}
        isSaving={isSaving}
        onOpenChange={(open) => {
          setEndorseModalOpen(open);
          if (!open) setEditingEndorsement(null);
        }}
        onSubmit={handleEndorseSubmit}
        onRemove={editingEndorsement ? handleRemove : undefined}
      />
    </div>
  );
}
