'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { EndorsementRecord } from '@/components/ui/endorsement-flow';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import {
  reportWalletActionFailure,
  isWalletUserCancellation,
} from '@/lib/wallet-errors';
import { cn } from '@/lib/utils';
import {
  cleanHandle,
  EndorsementTopicConflictError,
  endorsementActionFullLabel,
  humanizeEndorsementTopic,
  normalizeEndorsementTopic,
  type EndorsementSubmitInput,
} from '@/lib/endorsements';

interface EndorseModalProps {
  open: boolean;
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  issuerAccountId?: string | null;
  issuerAvatarUrl?: string | null;
  existing?: {
    topic?: string;
    note?: string;
  } | null;
  existingTopics?: string[];
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: EndorsementSubmitInput) => Promise<unknown>;
  onRemove?: (topic?: string) => Promise<unknown>;
}

const SUGGESTED_TOPICS = [
  'Governance',
  'Design',
  'Product',
  'Community',
  'Research',
];

const NOTE_MAX = 240;
const NOTE_MIN = 20;
const NOTE_WARNING_THRESHOLD = 220;
const TOPIC_MAX = 40;
const TOPIC_MIN = 2;
const TOPIC_WARNING_THRESHOLD = 36;

export function EndorseModal({
  open,
  targetAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  issuerAccountId = null,
  issuerAvatarUrl = null,
  existing,
  existingTopics = [],
  isSaving = false,
  onOpenChange,
  onSubmit,
  onRemove,
}: EndorseModalProps) {
  const reduceMotion = useReducedMotion();
  const [topic, setTopic] = useState(humanizeEndorsementTopic(existing?.topic));
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<TransactionFeedback | null>(
    null
  );

  const isEditing = !!existing;
  const originalNormalizedTopic = normalizeEndorsementTopic(
    existing?.topic ?? ''
  );
  const trimmedTopic = topic.trim();
  const normalizedTopic = normalizeEndorsementTopic(topic);
  const topicMoved = isEditing && normalizedTopic !== originalNormalizedTopic;
  const topicPreview = humanizeEndorsementTopic(topic);
  const trimmedNote = note.trim();
  const topicLength = topic.length;
  const noteLength = note.length;
  const handle = cleanHandle(targetAccountId);
  const displayName = targetDisplayName || `@${handle}`;
  const avatarInitial =
    (displayName === `@${handle}` ? handle : displayName)
      .trim()
      .slice(0, 1)
      .toUpperCase() || '?';
  const topicReady = normalizedTopic.length >= TOPIC_MIN;
  const noteReady = trimmedNote.length >= NOTE_MIN;
  const topicAlreadyUsed = existingTopics.some(
    (t) => normalizeEndorsementTopic(t) === normalizedTopic
  );
  const isTopicCollision =
    isEditing &&
    topicAlreadyUsed &&
    normalizedTopic !== originalNormalizedTopic;
  const isTopicOverwrite = !isEditing && topicAlreadyUsed;
  const canSubmit = topicReady && noteReady && !isTopicCollision;

  const primaryActionFullLabel = endorsementActionFullLabel(targetAccountId);

  const resetForm = () => {
    setTopic(humanizeEndorsementTopic(existing?.topic));
    setNote(existing?.note ?? '');
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!topicReady && !noteReady) {
      setError('Add a topic and a short reason to endorse.');
      return;
    }
    if (!topicReady) {
      setError(`Add a topic, at least ${TOPIC_MIN} characters.`);
      return;
    }
    if (!noteReady) {
      setError(`Add a short why, at least ${NOTE_MIN} characters.`);
      return;
    }

    if (isTopicCollision) {
      setError(
        `You already endorsed them for ${topicPreview || 'this topic'}. Open that endorsement to edit it.`
      );
      return;
    }

    const input: EndorsementSubmitInput = {
      topic: normalizedTopic,
      note: trimmedNote,
      ...(isEditing ? { previousTopic: existing?.topic ?? '' } : {}),
    };

    try {
      await onSubmit(input);
      handleOpenChange(false);
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      if (err instanceof EndorsementTopicConflictError) {
        setError(err.message);
        return;
      }
      reportWalletActionFailure(err, (msg) =>
        setActionToast({ type: 'error', msg })
      );
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setError(null);
    try {
      await onRemove(normalizedTopic || undefined);
      handleOpenChange(false);
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (msg) =>
        setActionToast({ type: 'error', msg })
      );
    }
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="endorse-modal"
              {...fadeMotion(reduceMotion ? 0 : 0.18)}
              className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4 py-6"
            >
              <button
                type="button"
                className="absolute inset-0 bg-background/72 backdrop-blur-md"
                onClick={() => handleOpenChange(false)}
                aria-label="Close endorse modal"
              />

              <motion.div
                {...scaleFadeMotion(!!reduceMotion, {
                  y: 16,
                  scale: 0.985,
                  duration: 0.22,
                  exitY: 10,
                  exitScale: 0.99,
                })}
                role="dialog"
                aria-modal="true"
                aria-labelledby="endorse-modal-title"
                className={cn(
                  'relative w-full max-w-md overflow-hidden rounded-2xl border border-border/67 bg-background/98',
                  portalElevatedShadowClass
                )}
              >
                <div className="flex items-start justify-between gap-4 px-5 pt-5">
                  <div className="min-w-0 flex-1">
                    <div className="portal-eyebrow text-muted-foreground/55">
                      {isEditing || isTopicOverwrite
                        ? 'Update endorsement'
                        : 'Public endorsement'}
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-sm font-semibold text-muted-foreground">
                        {targetAvatarUrl ? (
                          <img
                            src={targetAvatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          avatarInitial
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3
                          id="endorse-modal-title"
                          className="truncate text-lg font-semibold text-foreground"
                        >
                          {displayName}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-portal-neutral opacity-70">
                          @{targetAccountId}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ModalCloseButton
                    ariaLabel="Close endorse modal"
                    onClick={() => handleOpenChange(false)}
                    disabled={isSaving}
                  />
                </div>

                <div className="mt-4 px-5" aria-live="polite">
                  <div className="portal-eyebrow text-muted-foreground/50">
                    Preview
                  </div>
                  <div className="group mt-2 px-1 py-2">
                    <EndorsementRecord
                      issuer={issuerAccountId ?? ''}
                      target={targetAccountId}
                      targetName={targetDisplayName}
                      issuerAvatarUrl={issuerAvatarUrl}
                      targetAvatarUrl={targetAvatarUrl}
                      viewerAccountId={issuerAccountId}
                      topic={topicPreview || undefined}
                      note={trimmedNote || undefined}
                      issuerLabelOverride={
                        issuerAccountId ? undefined : 'You'
                      }
                      hideIssuerHandle={!issuerAccountId}
                      timeLabel={
                        <span className="text-right portal-type-caption tabular-nums text-muted-foreground/40">
                          just now
                        </span>
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-4 px-5 pb-5">
                  <div>
                    <label
                      htmlFor="endorse-topic"
                      className="text-xs font-medium text-portal-neutral uppercase tracking-[0.08em]"
                    >
                      For
                    </label>
                    <div className="portal-field-focus relative mt-1 rounded-2xl border border-border/40 bg-background/45">
                      <input
                        id="endorse-topic"
                        value={topic}
                        onChange={(e) => {
                          setTopic(e.target.value);
                          setError(null);
                        }}
                        placeholder="A topic, role, or contribution"
                        className="w-full bg-transparent px-4 py-3.5 pr-16 text-sm outline-none"
                        maxLength={TOPIC_MAX}
                        required
                        aria-required="true"
                      />
                      <span
                        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 portal-type-caption tabular-nums tracking-wide ${
                          topicLength > 0 && topicLength < TOPIC_MIN
                            ? 'text-amber-600'
                            : topicLength >= TOPIC_WARNING_THRESHOLD
                              ? 'text-amber-600'
                              : 'text-muted-foreground/60'
                        }`}
                      >
                        {topicLength < TOPIC_MIN
                          ? `${topicLength} / ${TOPIC_MIN} min`
                          : `${topicLength} / ${TOPIC_MAX}`}
                      </span>
                    </div>
                    <div className="mt-1 min-h-[14px] portal-type-caption text-muted-foreground/55">
                      {isTopicCollision ? (
                        <span className="text-[var(--portal-red)]">
                          You already endorsed for this topic — edit that
                          endorsement instead
                        </span>
                      ) : topicMoved ? (
                        <span className="text-[var(--portal-gold)]">
                          Changing the topic moves this endorsement — the
                          previous topic will be withdrawn
                        </span>
                      ) : isTopicOverwrite ? (
                        <span className="text-[var(--portal-gold)]">
                          You already endorsed for this topic — submitting will
                          update it
                        </span>
                      ) : normalizedTopic &&
                        normalizedTopic !== trimmedTopic ? (
                        <>
                          On-chain topic:{' '}
                          <span className="font-mono text-muted-foreground/80">
                            {normalizedTopic}
                          </span>
                        </>
                      ) : (
                        <span aria-hidden="true">&nbsp;</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="mr-0.5 portal-type-caption text-muted-foreground/50">
                        e.g.
                      </span>
                      {SUGGESTED_TOPICS.map((t) => {
                        const active =
                          trimmedTopic.toLowerCase() === t.toLowerCase();
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTopic(active ? '' : t);
                              setError(null);
                            }}
                            aria-pressed={active}
                            className={cn(
                              'rounded-full border px-2 py-0.5 portal-type-label font-medium transition-colors',
                              active
                                ? 'border-border/60 bg-background text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                                : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="endorse-note"
                      className="text-xs font-medium text-portal-neutral uppercase tracking-[0.08em]"
                    >
                      Why
                    </label>
                    <div className="portal-field-focus relative mt-1 rounded-2xl border border-border/40 bg-background/45">
                      <textarea
                        id="endorse-note"
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          setError(null);
                        }}
                        placeholder="What makes them worth endorsing here?"
                        rows={3}
                        maxLength={NOTE_MAX}
                        className="w-full resize-none bg-transparent px-4 pt-3.5 pb-7 text-sm leading-snug outline-none"
                        required
                        aria-required="true"
                      />
                      <span
                        className={`pointer-events-none absolute right-3 bottom-2 portal-type-caption tabular-nums tracking-wide ${
                          noteLength > 0 && noteLength < NOTE_MIN
                            ? 'text-amber-600'
                            : noteLength >= NOTE_WARNING_THRESHOLD
                              ? 'text-amber-600'
                              : 'text-muted-foreground/60'
                        }`}
                      >
                        {noteLength < NOTE_MIN
                          ? `${noteLength} / ${NOTE_MIN} min`
                          : `${noteLength} / ${NOTE_MAX}`}
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="mx-5 mb-3 rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs text-[var(--portal-red)]">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-2 border-t border-fade-section px-5 py-4">
                  {isEditing && onRemove ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemove}
                      loading={isSaving}
                      className="text-[var(--portal-red)] hover:text-[var(--portal-red)]"
                    >
                      Withdraw
                    </Button>
                  ) : null}
                  <PortalHoverTooltip
                    tooltip={
                      canSubmit
                        ? primaryActionFullLabel
                        : 'Add a topic and a short reason to endorse'
                    }
                    className="ml-auto"
                  >
                    <Button
                      type="button"
                      variant="endorsement"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      loading={isSaving}
                      className="focus-visible:ring-[var(--portal-gold-accent)]"
                      aria-label={
                        canSubmit
                          ? primaryActionFullLabel
                          : 'Add a topic and a short reason to endorse'
                      }
                    >
                      {isEditing || isTopicOverwrite ? 'Update' : 'Endorse'}
                    </Button>
                  </PortalHoverTooltip>
                </div>

                <p className="border-t border-fade-section px-5 py-3 text-center portal-type-caption text-portal-neutral opacity-60">
                  Public on-chain. You can update or withdraw this endorsement
                  anytime.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <TransactionFeedbackToast
        result={actionToast}
        onClose={() => setActionToast(null)}
      />
    </>
  );
}
