'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { profileActionButtonClass } from '@/components/ui/profile-action-pill';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { SearchInput } from '@/components/ui/search-input';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  cleanHandle,
  endorsementTimestamp,
  formatEndorsementTime,
  humanizeEndorsementTopic,
  normalizeEndorsementTopic,
  topTopics,
} from '@/lib/endorsements';
import type { EndorsementBuildInput, EndorsementListItem } from '@onsocial/sdk';
import { EndorseModal } from './endorse-modal';

export type EndorsementsModalMode = 'received' | 'given';

type EnrichedEndorsementListItem = EndorsementListItem & {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

interface RemoteEndorsements {
  accountId: string;
  received: EnrichedEndorsementListItem[];
  given: EnrichedEndorsementListItem[];
}

interface EndorsementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EndorsementsModalMode;
  isSelf: boolean;
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  endorsements: EnrichedEndorsementListItem[];
  viewerAccountId: string | null;
  onSelectAccount?: (accountId: string) => void;
  canEndorse?: boolean;
  isSavingEndorsement?: boolean;
  onEndorse?: (
    targetAccountId: string,
    input: EndorsementBuildInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (
    targetAccountId: string,
    topic?: string
  ) => Promise<unknown>;
  focusedEndorsement?: EnrichedEndorsementListItem | null;
  onClearFocusedEndorsement?: () => void;
  initialTopic?: string | null;
}

function isSameEndorsement(
  a: EnrichedEndorsementListItem,
  b: EnrichedEndorsementListItem
): boolean {
  return (
    a.issuer === b.issuer &&
    normalizeEndorsementTopic(a.topic ?? '').toLowerCase() ===
      normalizeEndorsementTopic(b.topic ?? '').toLowerCase()
  );
}

function uniqueTargetCount(
  endorsements: EnrichedEndorsementListItem[]
): number {
  return new Set(endorsements.map((item) => item.target)).size;
}

export function EndorsementsModal({
  open,
  onOpenChange,
  mode,
  isSelf,
  targetAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  endorsements,
  viewerAccountId,
  onSelectAccount,
  canEndorse = false,
  isSavingEndorsement = false,
  onEndorse,
  onRemoveEndorsement,
  focusedEndorsement = null,
  onClearFocusedEndorsement,
  initialTopic = null,
}: EndorsementsModalProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [remoteEndorsements, setRemoteEndorsements] =
    useState<RemoteEndorsements | null>(null);
  const [internalFocusedEndorsement, setInternalFocusedEndorsement] =
    useState<EnrichedEndorsementListItem | null>(null);

  const [endorseOpen, setEndorseOpen] = useState(false);
  const [editingFromList, setEditingFromList] =
    useState<EnrichedEndorsementListItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, scrollRef);
  const effectiveFocusedEndorsement =
    focusedEndorsement ?? internalFocusedEndorsement;

  const knownEndorsements =
    remoteEndorsements?.accountId === targetAccountId
      ? [...remoteEndorsements.received, ...remoteEndorsements.given]
      : endorsements;
  const modalTargetAccountId = editingFromList?.target ?? targetAccountId;
  const modalTargetDisplayName = editingFromList
    ? cleanHandle(editingFromList.target)
    : targetDisplayName;
  const modalTargetAvatarUrl = editingFromList
    ? editingFromList.target === targetAccountId
      ? targetAvatarUrl
      : editingFromList.targetAvatarUrl ?? null
    : targetAvatarUrl;

  const viewerExistingTopics = useMemo(
    () =>
      viewerAccountId
        ? knownEndorsements
            .filter(
              (e) =>
                e.issuer === viewerAccountId &&
                e.target === modalTargetAccountId
            )
            .map((e) => normalizeEndorsementTopic(e.topic ?? ''))
            .filter(Boolean)
        : [],
    [knownEndorsements, modalTargetAccountId, viewerAccountId]
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveTopic(initialTopic ?? null);
    setInternalFocusedEndorsement(null);
  }, [mode, open, targetAccountId, initialTopic]);

  useEffect(() => {
    if (!open || !targetAccountId) {
      return;
    }

    let cancelled = false;

    fetch(
      `/api/profile/endorsements?accountId=${encodeURIComponent(targetAccountId)}`,
      { cache: 'no-store' }
    )
      .then((r) => (r.ok ? r.json() : { received: [], given: [] }))
      .then((data) => {
        if (!cancelled) {
          setRemoteEndorsements({
            accountId: targetAccountId,
            received: data.received ?? [],
            given: data.given ?? [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteEndorsements({
            accountId: targetAccountId,
            received: [],
            given: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, targetAccountId]);

  const closeModal = () => {
    setQuery('');
    setActiveTopic(null);
    setInternalFocusedEndorsement(null);
    onClearFocusedEndorsement?.();
    onOpenChange(false);
  };

  const source =
    remoteEndorsements?.accountId === targetAccountId
      ? remoteEndorsements[mode]
      : endorsements;

  const filtered = useMemo(() => {
    let list = [...source];

    if (effectiveFocusedEndorsement) {
      list = list.filter((r) =>
        isSameEndorsement(r, effectiveFocusedEndorsement)
      );
    }

    if (activeTopic) {
      list = list.filter(
        (r) =>
          normalizeEndorsementTopic(r.topic ?? '').toLowerCase() ===
          activeTopic.toLowerCase()
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const account = cleanHandle(
          mode === 'received' ? r.issuer : r.target
        ).toLowerCase();
        const topic = (r.topic ?? '').toLowerCase();
        const topicLabel = humanizeEndorsementTopic(r.topic).toLowerCase();
        const note = (r.note ?? '').toLowerCase();
        return (
          account.includes(q) ||
          topic.includes(q) ||
          topicLabel.includes(q) ||
          note.includes(q)
        );
      });
    }

    return list.sort((a, b) => {
      const aAccount = mode === 'received' ? a.issuer : a.target;
      const bAccount = mode === 'received' ? b.issuer : b.target;
      const aMine = aAccount === viewerAccountId;
      const bMine = bAccount === viewerAccountId;
      if (aMine !== bMine) return aMine ? -1 : 1;
      return (
        (endorsementTimestamp(b) ?? 0) - (endorsementTimestamp(a) ?? 0)
      );
    });
  }, [
    source,
    query,
    activeTopic,
    viewerAccountId,
    effectiveFocusedEndorsement,
    mode,
  ]);

  const topicChips = useMemo(
    () => (effectiveFocusedEndorsement ? [] : topTopics(source, 8)),
    [source, effectiveFocusedEndorsement]
  );

  const hasActiveFilters =
    activeTopic !== null ||
    query.trim().length > 0 ||
    !!effectiveFocusedEndorsement;
  const targetCount = uniqueTargetCount(source);
  const endorsementCountLabel = `${source.length.toLocaleString()} ${
    source.length === 1 ? 'ENDORSEMENT' : 'ENDORSEMENTS'
  }`;
  const targetCountLabel = `${targetCount.toLocaleString()} ${
    targetCount === 1 ? 'ACCOUNT' : 'ACCOUNTS'
  }`;
  const endorsementMeta =
    mode === 'received'
      ? `${endorsementCountLabel} RECEIVED`
      : isSelf
        ? `YOU GAVE ${endorsementCountLabel} · ${targetCountLabel}`
        : `THEY GAVE ${endorsementCountLabel} · ${targetCountLabel}`;

  const handleSelect = (accountId: string) => {
    closeModal();
    onSelectAccount?.(accountId);
  };

  const clearFocusedEndorsement = () => {
    setInternalFocusedEndorsement(null);
    onClearFocusedEndorsement?.();
  };

  const handleRowClick = (
    endorsement: EnrichedEndorsementListItem,
    accountId: string
  ) => {
    if (effectiveFocusedEndorsement) {
      if (onSelectAccount) {
        handleSelect(accountId);
      }
      return;
    }

    setQuery('');
    setActiveTopic(null);
    setInternalFocusedEndorsement(endorsement);
  };

  const handleEndorseSubmit = async (input: EndorsementBuildInput) => {
    if (!onEndorse) return;
    const writeTarget = editingFromList?.target ?? targetAccountId;
    await onEndorse(writeTarget, input);
    if (viewerAccountId) {
      const normalizedTopic = normalizeEndorsementTopic(input.topic ?? '');
      const optimistic: EnrichedEndorsementListItem = {
        issuer: viewerAccountId,
        target: writeTarget,
        v: 1,
        since: Date.now(),
        topic: input.topic,
        note: input.note,
        expiresAt: input.expiresAt,
        blockHeight: 0,
        blockTimestamp: Date.now(),
        issuerAvatarUrl: editingFromList?.issuerAvatarUrl ?? null,
        targetAvatarUrl:
          editingFromList?.target === writeTarget
            ? editingFromList.targetAvatarUrl
            : writeTarget === targetAccountId
              ? targetAvatarUrl
              : null,
      };
      setRemoteEndorsements((current) => {
        if (current?.accountId !== targetAccountId) return current;
        const replaceMatching = (list: EnrichedEndorsementListItem[]) => [
          optimistic,
          ...list.filter(
            (item) =>
              !(
                item.issuer === viewerAccountId &&
                item.target === writeTarget &&
                normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
              )
          ),
        ];
        return {
          ...current,
          received:
            writeTarget === targetAccountId
              ? replaceMatching(current.received)
              : current.received,
          given:
            viewerAccountId === targetAccountId
              ? replaceMatching(current.given)
              : current.given,
        };
      });
    }
    setEndorseOpen(false);
  };

  const handleRemoveEndorsement = async (topic?: string) => {
    if (!onRemoveEndorsement || !viewerAccountId) return;
    const writeTarget = editingFromList?.target ?? targetAccountId;
    await onRemoveEndorsement(writeTarget, topic);
    const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
    setRemoteEndorsements((current) => {
      if (current?.accountId !== targetAccountId) return current;
      const removeMatching = (list: EnrichedEndorsementListItem[]) =>
        list.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              item.target === writeTarget &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
            )
        );
      return {
        ...current,
        received:
          writeTarget === targetAccountId
            ? removeMatching(current.received)
            : current.received,
        given:
          viewerAccountId === targetAccountId
            ? removeMatching(current.given)
            : current.given,
      };
    });
    setEndorseOpen(false);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="endorsements-list"
            {...fadeMotion(reduceMotion ? 0 : 0.18)}
            data-lenis-prevent
            className="fixed inset-0 z-[2147483646] flex items-center justify-center px-4 py-6"
          >
            <button
              type="button"
              className="absolute inset-0 bg-background/72 backdrop-blur-md"
              onClick={closeModal}
              aria-label="Close endorsements"
            />

            <motion.div
              {...scaleFadeMotion(!!reduceMotion, {
                y: 16,
                scale: 0.98,
                duration: 0.22,
                exitY: 10,
                exitScale: 0.99,
              })}
              role="dialog"
              aria-modal="true"
              aria-labelledby="endorsements-modal-title"
              className={cn(
                'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
                portalElevatedShadowClass
              )}
            >
              <ModalHeader
                titleId="endorsements-modal-title"
                title={targetDisplayName}
                description={endorsementMeta}
                descriptionVariant="meta"
                actions={
                  <>
                    {mode === 'received' && canEndorse && onEndorse ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFromList(null);
                          closeModal();
                          setEndorseOpen(true);
                        }}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors portal-gold-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]"
                      >
                        Endorse
                      </button>
                    ) : null}
                    <ModalCloseButton
                      ariaLabel="Close endorsements"
                      onClick={closeModal}
                    />
                  </>
                }
              />

              <div className="shrink-0 space-y-4 px-4 pb-4 md:px-5">
                {!effectiveFocusedEndorsement ? (
                  <SearchInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search people, topics, or notes"
                    size="sm"
                    autoFocus
                    maxLength={80}
                    clearAriaLabel="Clear endorsements search"
                  />
                ) : null}

                {effectiveFocusedEndorsement ? (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTopic(null);
                        setQuery('');
                        clearFocusedEndorsement();
                      }}
                      className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View all
                    </button>
                  </div>
                ) : topicChips.length > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex min-w-max items-center gap-1.5 pr-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
                          Topics
                        </span>
                        {topicChips.map(({ topic, label, count }) => {
                          const active = activeTopic === topic;
                          return (
                            <button
                              key={topic}
                              type="button"
                              onClick={() =>
                                setActiveTopic(active ? null : topic)
                              }
                              aria-pressed={active}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                                active
                                  ? 'border-border/60 bg-background font-medium text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                                  : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                              )}
                            >
                              <span>{label}</span>
                              <span className="text-[10px] tabular-nums opacity-70">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTopic(null);
                          setQuery('');
                          clearFocusedEndorsement();
                        }}
                        className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : hasActiveFilters ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTopic(null);
                        setQuery('');
                        clearFocusedEndorsement();
                      }}
                      className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5"
              >
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground/65">
                    No matching endorsements.
                  </div>
                ) : (
                  <div className="divide-y divide-fade-item">
                    {filtered.map((rec, idx) => {
                      const accountId =
                        mode === 'received' ? rec.issuer : rec.target;
                      const accountLabel = cleanHandle(accountId);
                      const isMine = accountId === viewerAccountId;
                      const canUpdateThisEndorsement =
                        rec.issuer === viewerAccountId &&
                        Boolean(onEndorse);
                      const timeLabel = formatEndorsementTime(
                        endorsementTimestamp(rec)
                      );
                      const timeDescription = timeLabel
                        ? `Endorsement ${timeLabel}`
                        : undefined;
                      const issuerInitial =
                        cleanHandle(rec.issuer).slice(0, 1).toUpperCase() ||
                        '?';
                      const targetInitialChar =
                        mode === 'received'
                          ? (targetDisplayName || '?').slice(0, 1).toUpperCase()
                          : cleanHandle(rec.target).slice(0, 1).toUpperCase() ||
                            '?';
                      const issuerIsVariable = mode === 'received';
                      const issuerAvatarUrl =
                        rec.issuerAvatarUrl ??
                        (!issuerIsVariable && rec.issuer === targetAccountId
                          ? targetAvatarUrl
                          : null);
                      const targetAvatarSource =
                        rec.targetAvatarUrl ??
                        (issuerIsVariable && rec.target === targetAccountId
                          ? targetAvatarUrl
                          : null);

                      return (
                        <div
                          key={`${rec.issuer}:${rec.target}:${rec.topic ?? ''}:${idx}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleRowClick(rec, accountId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleRowClick(rec, accountId);
                            }
                          }}
                          className="group flex w-full cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] focus-visible:bg-[var(--portal-slate-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]"
                          aria-label={
                            effectiveFocusedEndorsement && onSelectAccount
                              ? `Open profile for ${accountId}`
                              : `Focus endorsement from ${cleanHandle(rec.issuer)} for ${cleanHandle(rec.target)}`
                          }
                        >
                          <div
                            className="mt-0.5 flex shrink-0 items-center gap-1"
                            aria-hidden="true"
                          >
                            {issuerAvatarUrl ? (
                              <img
                                src={issuerAvatarUrl}
                                alt=""
                                className={
                                  issuerIsVariable
                                    ? 'h-9 w-9 rounded-full border border-[var(--portal-gold-border)] object-cover'
                                    : 'h-5 w-5 rounded-full border border-border/40 object-cover opacity-80'
                                }
                              />
                            ) : issuerIsVariable ? (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-sm font-semibold text-[var(--portal-gold)]">
                                {issuerInitial}
                              </div>
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-[9px] font-semibold text-muted-foreground/80">
                                {issuerInitial}
                              </div>
                            )}
                            <ProtocolMotionArrow className="h-3 w-3 text-[var(--portal-gold)]/70" />
                            {targetAvatarSource ? (
                              <img
                                src={targetAvatarSource}
                                alt=""
                                className={
                                  !issuerIsVariable
                                    ? 'h-9 w-9 rounded-full border border-[var(--portal-gold-border)] object-cover'
                                    : 'h-5 w-5 rounded-full border border-border/40 object-cover opacity-80'
                                }
                              />
                            ) : !issuerIsVariable ? (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-sm font-semibold text-[var(--portal-gold)]">
                                {targetInitialChar}
                              </div>
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-[9px] font-semibold text-muted-foreground/80">
                                {targetInitialChar}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 pt-px">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate font-medium text-foreground">
                                    {accountLabel}
                                  </span>
                                  {isMine && (
                                    <span className="rounded-full border border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] px-1.5 py-px text-[9px] font-semibold text-[var(--portal-gold)]">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
                                  {mode === 'received' ? 'From' : 'To'} @
                                  {accountId}
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {timeLabel ? (
                                  <PortalHoverTooltip
                                    className="text-right text-[10px] tabular-nums text-muted-foreground/55"
                                    aria-label={timeDescription}
                                    stopPropagation
                                    tooltip={timeDescription}
                                  >
                                    {timeLabel}
                                  </PortalHoverTooltip>
                                ) : null}
                                {canUpdateThisEndorsement ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingFromList(rec);
                                      setEndorseOpen(true);
                                    }}
                                    className={profileActionButtonClass('gold')}
                                    aria-label={`Update endorsement for ${humanizeEndorsementTopic(rec.topic) || 'general'}`}
                                  >
                                    <PenLine className="h-2.5 w-2.5" strokeWidth={2.5} />
                                    Update
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2 text-[12px] leading-snug">
                              <div className="font-medium text-[var(--portal-gold-text)]">
                                For{' '}
                                {rec.topic
                                  ? humanizeEndorsementTopic(rec.topic)
                                  : 'this endorsement'}
                              </div>

                              {rec.note ? (
                                <div className="mt-1 text-muted-foreground/75">
                                  &ldquo;{rec.note}&rdquo;
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-fade-section px-5 py-3 text-center text-[10px] text-muted-foreground/60 md:px-6">
                Endorsements are public on-chain signals. Anyone can view them.
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <EndorseModal
        key={editingFromList ? `edit:${editingFromList.topic ?? ''}` : 'new'}
        open={endorseOpen}
        onOpenChange={(open) => {
          setEndorseOpen(open);
          if (!open) setEditingFromList(null);
        }}
        targetAccountId={modalTargetAccountId}
        targetDisplayName={modalTargetDisplayName}
        targetAvatarUrl={modalTargetAvatarUrl}
        issuerAccountId={viewerAccountId}
        existing={
          editingFromList
            ? { topic: editingFromList.topic, note: editingFromList.note }
            : null
        }
        existingTopics={viewerExistingTopics}
        isSaving={isSavingEndorsement}
        onSubmit={handleEndorseSubmit}
        onRemove={editingFromList ? handleRemoveEndorsement : undefined}
      />
    </>,
    document.body
  );
}
