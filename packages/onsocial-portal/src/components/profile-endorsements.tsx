'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { Skeleton } from '@/components/ui/skeleton';
import { EndorseModal } from './endorse-modal';
import {
  EndorsementsModal,
  type EndorsementsModalMode,
} from './endorsements-modal';
import {
  cleanHandle,
  endorsementTimestamp,
  formatEndorsementTime,
  humanizeEndorsementTopic,
  normalizeEndorsementTopic,
} from '@/lib/endorsements';
import type { EndorsementBuildInput, EndorsementListItem } from '@onsocial/sdk';

type EndorsementItem = EndorsementListItem;

export interface EndorsementsModalIntent {
  mode: EndorsementsModalMode;
  nonce: number;
  topic?: string | null;
}

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
  hasSocialSession?: boolean;
  onEndorse?: (
    target: string,
    input: EndorsementBuildInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
  onSelectAccount?: (accountId: string) => void;
  onEndorsementCountChange?: (count: number) => void;
  onGivenCountChange?: (count: number) => void;
  endorsementsModalIntent?: EndorsementsModalIntent | null;
}

export function ProfileEndorsements({
  accountId,
  viewerAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  hasSocialSession = false,
  onEndorse,
  onRemoveEndorsement,
  onSelectAccount,
  onEndorsementCountChange,
  onGivenCountChange,
  endorsementsModalIntent = null,
}: ProfileEndorsementsProps) {
  const [endorsements, setEndorsements] = useState<EndorsementItem[]>([]);
  const [givenEndorsements, setGivenEndorsements] = useState<EndorsementItem[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [endorseModalOpen, setEndorseModalOpen] = useState(false);
  const [endorsementsModalOpen, setEndorsementsModalOpen] = useState(false);
  const [endorsementsMode, setEndorsementsMode] =
    useState<EndorsementsModalMode>('received');
  const [myExisting, setMyExisting] = useState<EndorsementItem | null>(null);
  const [focusedEndorsement, setFocusedEndorsement] =
    useState<EndorsementItem | null>(null);
  const [pendingInitialTopic, setPendingInitialTopic] = useState<string | null>(
    null
  );

  const isSelf = viewerAccountId === accountId;
  const canEndorse = Boolean(
    viewerAccountId && accountId && !isSelf && onEndorse
  );
  const endorseActionLabel = myExisting
    ? 'Update'
    : hasSocialSession
      ? 'Endorse'
      : 'Authorize';

  const loadEndorsements = useCallback(async () => {
    if (!accountId) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/profile/endorsements?accountId=${encodeURIComponent(accountId)}`,
        {
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          received?: EndorsementItem[];
          given?: EndorsementItem[];
        };
        const list = data.received ?? [];
        setEndorsements(list);
        setGivenEndorsements(data.given ?? []);

        if (viewerAccountId) {
          const mine = list.find((e) => e.issuer === viewerAccountId);
          setMyExisting(mine ?? null);
        } else {
          setMyExisting(null);
        }
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
    onEndorsementCountChange?.(endorsements.length);
  }, [endorsements.length, onEndorsementCountChange]);

  const handleEndorseSubmit = async (input: EndorsementBuildInput) => {
    if (!accountId) throw new Error('Profile account is not ready.');
    if (!viewerAccountId)
      throw new Error('Connect your wallet before endorsing.');
    if (!onEndorse)
      throw new Error('Endorsement writes are not available here.');

    setIsSaving(true);
    try {
      await onEndorse(accountId, input);
      const optimistic: EndorsementItem = {
        issuer: viewerAccountId,
        target: accountId,
        v: 1,
        since: Date.now(),
        topic: input.topic,
        note: input.note,
        expiresAt: input.expiresAt,
        blockHeight: 0,
        blockTimestamp: Date.now(),
      };
      setMyExisting(optimistic);
      setEndorsements((current) => [
        optimistic,
        ...current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              (item.topic ?? '') === (input.topic ?? '')
            )
        ),
      ]);
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
      setMyExisting(null);
      const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
      setEndorsements((current) =>
        current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
            )
        )
      );
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

  useEffect(() => {
    onGivenCountChange?.(givenAccountCount);
  }, [givenAccountCount, onGivenCountChange]);

  useEffect(() => {
    if (!endorsementsModalIntent) return;
    setFocusedEndorsement(null);
    setEndorsementsMode(endorsementsModalIntent.mode);
    setPendingInitialTopic(endorsementsModalIntent.topic ?? null);
    setEndorsementsModalOpen(true);
  }, [endorsementsModalIntent]);

  const givenSignalLabel =
    givenAccountCount === 1
      ? '1 account'
      : `${formatCount(givenAccountCount)} accounts`;

  const PROFILE_SUMMARY_COUNT = 1;
  const visibleEndorsements = rankedEndorsements.slice(
    0,
    PROFILE_SUMMARY_COUNT
  );
  const openEndorsementDetails = (endorsement: EndorsementItem) => {
    setFocusedEndorsement(endorsement);
    setEndorsementsMode('received');
    setPendingInitialTopic(null);
    setEndorsementsModalOpen(true);
  };
  const openAllEndorsements = () => {
    setFocusedEndorsement(null);
    setEndorsementsMode('received');
    setPendingInitialTopic(null);
    setEndorsementsModalOpen(true);
  };

  return (
    <div className="mt-4" id="profile-endorsements">
      <div className="h-px divider-section" />

      <div className="pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">
            {rankedEndorsements.length > 0
              ? 'Latest endorsement'
              : 'Endorsements'}
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            {rankedEndorsements.length > 1 ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={openAllEndorsements}
                className="gap-1.5 px-2.5"
                aria-label={`View all ${formatCount(rankedEndorsements.length)} endorsements`}
              >
                View all
                <ProtocolMotionArrow className="h-3 w-3" />
              </Button>
            ) : null}

            {canEndorse ? (
              <Button
                type="button"
                size="xs"
                variant={myExisting ? 'outline' : 'endorsement'}
                onClick={() => setEndorseModalOpen(true)}
                aria-label={
                  myExisting
                    ? `Update endorsement for ${targetDisplayName}`
                    : hasSocialSession
                      ? `Endorse ${targetDisplayName}`
                      : `Authorize and endorse ${targetDisplayName}`
                }
                title={
                  myExisting
                    ? `Update endorsement for ${targetDisplayName}`
                    : hasSocialSession
                      ? `Endorse ${targetDisplayName}`
                      : `Authorize and endorse ${targetDisplayName}`
                }
              >
                {endorseActionLabel}
              </Button>
            ) : isSelf ? (
              <span className="text-[11px] portal-slate-text opacity-70">
                Others can endorse you
              </span>
            ) : !viewerAccountId ? (
              <span className="text-[11px] portal-slate-text opacity-70">
                Connect to endorse
              </span>
            ) : null}
          </div>
        </div>

        {isLoading && endorsements.length === 0 ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleEndorsements.length > 0 ? (
          <div className="mt-3 divide-y divide-fade-item">
            {visibleEndorsements.map((e, index) => {
              const secondaryText = e.note?.trim();
              const timeLabel = formatEndorsementTime(endorsementTimestamp(e));

              return (
                <button
                  key={`${e.issuer}:${e.topic ?? ''}:${e.blockHeight}:${index}`}
                  type="button"
                  onClick={() => openEndorsementDetails(e)}
                  aria-label={`Endorsement from ${cleanHandle(e.issuer)} for ${targetDisplayName}`}
                  className="group flex w-full items-start gap-3 px-1 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)] disabled:pointer-events-none"
                >
                  <div
                    className="mt-0.5 flex shrink-0 items-center gap-1"
                    aria-hidden="true"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-xs font-semibold text-[var(--portal-gold)]">
                      {cleanHandle(e.issuer).slice(0, 1).toUpperCase() || '?'}
                    </div>
                    <ProtocolMotionArrow className="h-3 w-3 text-[var(--portal-gold)]/70" />
                    {targetAvatarUrl ? (
                      <img
                        src={targetAvatarUrl}
                        alt=""
                        className="h-5 w-5 rounded-full border border-border/40 object-cover opacity-80"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-[9px] font-semibold text-muted-foreground/80">
                        {(targetDisplayName || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
                        <span
                          className="truncate font-medium text-foreground/90 transition-colors group-hover:text-[var(--portal-gold)]"
                          title={e.issuer}
                        >
                          {cleanHandle(e.issuer)}
                        </span>

                        {viewerAccountId === e.issuer ? (
                          <span className="rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] px-1.5 py-px text-[9px] font-medium text-[var(--portal-gold)]">
                            You
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                        @{e.issuer}
                      </div>
                    </div>

                    {timeLabel ? (
                      <span className="shrink-0 pt-px text-right text-[10px] tabular-nums text-muted-foreground/45">
                        {timeLabel}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-[11px] leading-snug">
                    <div className="font-medium text-[var(--portal-gold-text)]">
                      For{' '}
                      {e.topic
                        ? humanizeEndorsementTopic(e.topic)
                        : 'this endorsement'}
                    </div>
                    {secondaryText ? (
                      <p
                        className="mt-1 line-clamp-2 text-muted-foreground/65"
                        title={secondaryText}
                      >
                        &ldquo;{secondaryText}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  </div>
                </button>
              );
            })}

          </div>
        ) : (
          <div className="mt-2 text-[12px] text-muted-foreground/60">
            No endorsements yet.
          </div>
        )}

        {givenAccountCount > 0 ? (
          <div className="mt-2 text-[11px] text-muted-foreground/50">
            {isSelf ? 'You endorse' : 'They endorse'}{' '}
            <span className="font-medium text-muted-foreground/70">
              {givenSignalLabel}
            </span>
          </div>
        ) : null}
      </div>

      <EndorseModal
        key={`${accountId ?? ''}:${myExisting?.issuer ?? ''}:${
          myExisting?.topic ?? ''
        }`}
        open={endorseModalOpen}
        targetAccountId={accountId ?? ''}
        targetDisplayName={targetDisplayName}
        targetAvatarUrl={targetAvatarUrl}
        issuerAccountId={viewerAccountId}
        existing={
          myExisting
            ? {
                topic: myExisting.topic,
                note: myExisting.note,
              }
            : null
        }
        isSaving={isSaving}
        onOpenChange={setEndorseModalOpen}
        onSubmit={handleEndorseSubmit}
        onRemove={myExisting ? handleRemove : undefined}
      />

      <EndorsementsModal
        open={endorsementsModalOpen}
        onOpenChange={(open) => {
          setEndorsementsModalOpen(open);
          if (!open) {
            setFocusedEndorsement(null);
            setPendingInitialTopic(null);
          }
        }}
        initialTopic={pendingInitialTopic}
        mode={endorsementsMode}
        isSelf={isSelf}
        targetAccountId={accountId ?? ''}
        targetDisplayName={targetDisplayName}
        targetAvatarUrl={targetAvatarUrl}
        endorsements={
          endorsementsMode === 'received' ? endorsements : givenEndorsements
        }
        viewerAccountId={viewerAccountId}
        onSelectAccount={onSelectAccount}
        canEndorse={endorsementsMode === 'received' && canEndorse}
        existingEndorsement={
          myExisting
            ? {
                topic: myExisting.topic,
                note: myExisting.note,
              }
            : null
        }
        isSavingEndorsement={isSaving}
        onEndorse={handleEndorseSubmit}
        onRemoveEndorsement={myExisting ? handleRemove : undefined}
        focusedEndorsement={
          endorsementsMode === 'received' ? focusedEndorsement : null
        }
        onClearFocusedEndorsement={() => setFocusedEndorsement(null)}
      />
    </div>
  );
}
