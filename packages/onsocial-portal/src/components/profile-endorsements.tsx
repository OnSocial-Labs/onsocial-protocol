'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
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

type EndorsementItem = EndorsementListItem & {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

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
  selfAvatarUrl?: string | null;
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
  selfAvatarUrl = null,
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
  const [myEndorsements, setMyEndorsements] = useState<EndorsementItem[]>([]);
  const [editingEndorsement, setEditingEndorsement] =
    useState<EndorsementItem | null>(null);
  const [focusedEndorsement, setFocusedEndorsement] =
    useState<EndorsementItem | null>(null);
  const [pendingInitialTopic, setPendingInitialTopic] = useState<string | null>(
    null
  );

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
          setMyEndorsements(
            list.filter((e) => e.issuer === viewerAccountId)
          );
        } else {
          setMyEndorsements([]);
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
        issuerAvatarUrl: selfAvatarUrl,
        targetAvatarUrl,
      };
      const normalizedNew = normalizeEndorsementTopic(input.topic ?? '');
      setMyEndorsements((prev) => [
        optimistic,
        ...prev.filter(
          (item) =>
            normalizeEndorsementTopic(item.topic ?? '') !== normalizedNew
        ),
      ]);
      setEndorsements((current) => [
        optimistic,
        ...current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedNew
            )
        ),
      ]);
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

  const handleModalEndorseSubmit = async (
    target: string,
    input: EndorsementBuildInput
  ) => {
    if (target === accountId) {
      return handleEndorseSubmit(input);
    }
    if (!viewerAccountId) {
      throw new Error('Connect your wallet before endorsing.');
    }
    if (!onEndorse) {
      throw new Error('Endorsement writes are not available here.');
    }

    setIsSaving(true);
    try {
      await onEndorse(target, input);
      const normalizedNew = normalizeEndorsementTopic(input.topic ?? '');
      const optimistic: EndorsementItem = {
        issuer: viewerAccountId,
        target,
        v: 1,
        since: Date.now(),
        topic: input.topic,
        note: input.note,
        expiresAt: input.expiresAt,
        blockHeight: 0,
        blockTimestamp: Date.now(),
        issuerAvatarUrl: selfAvatarUrl,
      };
      setGivenEndorsements((current) => [
        optimistic,
        ...current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              item.target === target &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedNew
            )
        ),
      ]);
      window.setTimeout(() => void loadEndorsements(), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalRemove = async (target: string, topic?: string) => {
    if (target === accountId) {
      return handleRemove(topic);
    }
    if (!viewerAccountId) {
      throw new Error('Connect your wallet before removing an endorsement.');
    }
    if (!onRemoveEndorsement) {
      throw new Error('Endorsement removal is not available here.');
    }

    setIsSaving(true);
    try {
      await onRemoveEndorsement(target, topic);
      const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
      setGivenEndorsements((current) =>
        current.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              item.target === target &&
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
  const givenEndorsementCount = givenEndorsements.length;

  useEffect(() => {
    onGivenCountChange?.(givenEndorsementCount);
  }, [givenEndorsementCount, onGivenCountChange]);

  useEffect(() => {
    if (!endorsementsModalIntent) return;
    setFocusedEndorsement(null);
    setEndorsementsMode(endorsementsModalIntent.mode);
    setPendingInitialTopic(endorsementsModalIntent.topic ?? null);
    setEndorsementsModalOpen(true);
  }, [endorsementsModalIntent]);

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
              <span className="text-[11px] portal-slate-text opacity-70">
                {MAX_ENDORSEMENTS_PER_TARGET} topics max
              </span>
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
                <button
                  key={`${e.issuer}:${e.topic ?? ''}:${e.blockHeight}:${index}`}
                  type="button"
                  onClick={() => openEndorsementDetails(e)}
                  aria-label={`Endorsement from ${cleanHandle(e.issuer)} for ${targetDisplayName}`}
                  className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] focus-visible:bg-[var(--portal-slate-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)] disabled:pointer-events-none"
                >
                  <div
                    className="mt-0.5 flex shrink-0 items-center gap-1"
                    aria-hidden="true"
                  >
                    {issuerAvatarUrl ? (
                      <img
                        src={issuerAvatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full border border-[var(--portal-gold-border)] object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-xs font-semibold text-[var(--portal-gold)]">
                        {cleanHandle(e.issuer).slice(0, 1).toUpperCase() ||
                          '?'}
                      </div>
                    )}
                    <ProtocolMotionArrow className="h-3 w-3 text-[var(--portal-gold)]/70" />
                    {endorsementTargetAvatarUrl ? (
                      <img
                        src={endorsementTargetAvatarUrl}
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
                          className="truncate font-medium text-foreground/90"
                          title={e.issuer}
                        >
                          {cleanHandle(e.issuer)}
                        </span>

                        {viewerAccountId === e.issuer ? (
                          <span className="rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] px-1.5 py-px text-[9px] font-semibold text-[var(--portal-gold)]">
                            You
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                        From @{e.issuer}
                      </div>
                    </div>

                    {timeLabel ? (
                      <PortalHoverTooltip
                        className="shrink-0 pt-px text-right text-[10px] tabular-nums text-muted-foreground/45"
                        aria-label={timeDescription}
                        stopPropagation
                        tooltip={timeDescription}
                      >
                        {timeLabel}
                      </PortalHoverTooltip>
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

        {myEndorsements.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/45">
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
                className="rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--portal-gold)] transition-colors hover:border-[var(--portal-gold-border-strong)] hover:bg-[var(--portal-gold-bg)]"
              >
                {humanizeEndorsementTopic(e.topic) || 'General'}
              </button>
            ))}
          </div>
        ) : null}

        {givenEndorsementCount > 0 ? (
          <div className="mt-2 text-[11px] text-muted-foreground/50">
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
        canEndorse={endorsementsMode === 'received' && canAddNew}
        isSavingEndorsement={isSaving}
        onEndorse={handleModalEndorseSubmit}
        onRemoveEndorsement={handleModalRemove}
        focusedEndorsement={
          endorsementsMode === 'received' ? focusedEndorsement : null
        }
        onClearFocusedEndorsement={() => setFocusedEndorsement(null)}
      />
    </div>
  );
}
