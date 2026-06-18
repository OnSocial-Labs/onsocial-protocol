'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ImagePlus } from 'lucide-react';
import type { MediaRef } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { EndorsementRecordEditor } from '@/components/ui/endorsement-flow';
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
  EndorsementTopicConflictError,
  endorsementActionFullLabel,
  humanizeEndorsementTopic,
  normalizeEndorsementTopic,
  resolveEndorsementListPartyDisplay,
  type EndorsementSubmitInput,
} from '@/lib/endorsements';
import {
  ENDORSEMENT_NOTE_LIMITS,
  getBoundedNoteCounterClass,
  getBoundedNoteCounterLabel,
  getBoundedNoteError,
  isEndorsementContentReady,
  normalizeBoundedNote,
} from '@/lib/bounded-note-field';
import {
  ENDORSEMENT_IMAGE_MAX_BYTES,
  ENDORSEMENT_VIDEO_MAX_BYTES,
  ENDORSEMENT_VIDEO_MAX_SECONDS,
  parseEndorsementMediaRef,
  validateEndorsementMediaFile,
} from '@/lib/endorsement-media';

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
    id?: string;
    media?: MediaRef | null;
    mediaUrl?: string | null;
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
] as const;

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
  const mediaInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingMedia = parseEndorsementMediaRef(existing?.media);
  const [topic, setTopic] = useState(humanizeEndorsementTopic(existing?.topic));
  const [note, setNote] = useState(existing?.note ?? '');
  const [topicFocused, setTopicFocused] = useState(false);
  const [noteFieldVisible, setNoteFieldVisible] = useState(
    () =>
      Boolean(existing?.note?.trim()) ||
      !parseEndorsementMediaRef(existing?.media)
  );
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isMediaProcessing, setIsMediaProcessing] = useState(false);
  const [mediaRemoved, setMediaRemoved] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<TransactionFeedback | null>(
    null
  );

  const isEditing = !!existing;
  const partyDisplay = useMemo(
    () =>
      resolveEndorsementListPartyDisplay(
        {
          issuer: issuerAccountId ?? '',
          target: targetAccountId,
          issuerAvatarUrl,
          targetAvatarUrl,
        },
        {
          pageAccountId: targetAccountId,
          pageDisplayName: targetDisplayName,
          pageAvatarUrl: targetAvatarUrl,
          viewerAccountId: issuerAccountId,
          viewerAvatarUrl: issuerAvatarUrl,
        }
      ),
    [
      issuerAccountId,
      issuerAvatarUrl,
      targetAccountId,
      targetAvatarUrl,
      targetDisplayName,
    ]
  );
  const originalNormalizedTopic = normalizeEndorsementTopic(
    existing?.topic ?? ''
  );
  const trimmedTopic = topic.trim();
  const normalizedTopic = normalizeEndorsementTopic(topic);
  const topicMoved = isEditing && normalizedTopic !== originalNormalizedTopic;
  const topicPreview = humanizeEndorsementTopic(topic);
  const normalizedNote = normalizeBoundedNote(note);
  const noteTextError = getBoundedNoteError(note);
  const trimmedNote = normalizedNote;
  const topicLength = topic.length;
  const noteLength = normalizedNote.length;
  const hasNote = noteLength > 0;
  const hasMediaAttachment = !!mediaFile || (!mediaRemoved && !!existingMedia);
  const previewMediaUrl = mediaFile
    ? filePreviewUrl
    : !mediaRemoved
      ? (existing?.mediaUrl ?? null)
      : null;
  const previewMediaMime = mediaFile?.type ?? existingMedia?.mime ?? null;
  const topicReady = normalizedTopic.length >= TOPIC_MIN;
  const contentReady = isEndorsementContentReady(
    note,
    hasMediaAttachment,
    ENDORSEMENT_NOTE_LIMITS
  );
  const topicAlreadyUsed = existingTopics.some(
    (t) => normalizeEndorsementTopic(t) === normalizedTopic
  );
  const isTopicCollision =
    isEditing &&
    topicAlreadyUsed &&
    normalizedTopic !== originalNormalizedTopic;
  const isTopicOverwrite = !isEditing && topicAlreadyUsed;
  const canSubmit =
    topicReady && contentReady && !isTopicCollision && !isMediaProcessing;

  const primaryActionFullLabel = endorsementActionFullLabel(targetAccountId);
  const showSuggestedTopics = topicFocused || trimmedTopic.length === 0;

  const topicHint = isTopicCollision ? (
    <span className="text-[var(--portal-red)]">
      You already endorsed for this topic — edit that endorsement instead
    </span>
  ) : topicMoved ? (
    <span className="text-[var(--portal-gold)]">
      Changing the topic moves this endorsement — the previous topic will be
      withdrawn
    </span>
  ) : isTopicOverwrite ? (
    <span className="text-[var(--portal-gold)]">
      You already endorsed for this topic — submitting will update it
    </span>
  ) : normalizedTopic && normalizedTopic !== trimmedTopic ? (
    <>
      On-chain topic:{' '}
      <span className="font-mono text-muted-foreground/80">
        {normalizedTopic}
      </span>
    </>
  ) : null;

  const mediaLimitsHint = `Photo ≤${Math.round(ENDORSEMENT_IMAGE_MAX_BYTES / (1024 * 1024))} MB · video ≤${Math.round(ENDORSEMENT_VIDEO_MAX_BYTES / (1024 * 1024))} MB, ${ENDORSEMENT_VIDEO_MAX_SECONDS}s`;
  const mediaLimitsHintShort = `≤${Math.round(ENDORSEMENT_IMAGE_MAX_BYTES / (1024 * 1024))} MB photo · ≤${ENDORSEMENT_VIDEO_MAX_SECONDS}s video`;

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const resetForm = () => {
    setTopic(humanizeEndorsementTopic(existing?.topic));
    setNote(existing?.note ?? '');
    setTopicFocused(false);
    setNoteFieldVisible(
      Boolean(existing?.note?.trim()) ||
        !parseEndorsementMediaRef(existing?.media)
    );
    setMediaFile(null);
    setIsMediaProcessing(false);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    setMediaRemoved(false);
    setMediaError(null);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleMediaPick = async (file: File | null) => {
    setMediaError(null);
    setError(null);
    if (!file) return;

    setIsMediaProcessing(true);
    try {
      const validationError = await validateEndorsementMediaFile(file);
      if (validationError) {
        setMediaError(validationError);
        return;
      }

      setMediaFile(file);
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(URL.createObjectURL(file));
      setMediaRemoved(false);
      if (!trimmedNote) {
        setNoteFieldVisible(false);
      }
    } finally {
      setIsMediaProcessing(false);
    }
  };

  const handleClearMedia = () => {
    setMediaFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    setMediaRemoved(true);
    setMediaError(null);
    setError(null);
  };

  const resolveSubmitMedia = (
    pickedFile: File | null
  ): EndorsementSubmitInput['media'] => {
    if (pickedFile) return pickedFile;
    if (mediaRemoved) return null;
    if (existingMedia) return existingMedia;
    return undefined;
  };

  const handleSubmit = async () => {
    setError(null);
    if (isMediaProcessing) {
      return;
    }
    if (!topicReady) {
      setError(`Add a topic, at least ${TOPIC_MIN} characters.`);
      return;
    }
    if (noteTextError) {
      setError(noteTextError);
      return;
    }
    if (!contentReady) {
      setError('Add a note or attach a photo or video.');
      return;
    }
    if (mediaError) {
      setError(mediaError);
      return;
    }

    if (isTopicCollision) {
      setError(
        `You already endorsed them for ${topicPreview || 'this topic'}. Open that endorsement to edit it.`
      );
      return;
    }

    const pickedFile = mediaFile ?? fileInputRef.current?.files?.[0] ?? null;
    if (pickedFile && !mediaFile) {
      const validationError = await validateEndorsementMediaFile(pickedFile);
      if (validationError) {
        setMediaError(validationError);
        return;
      }
    }

    const submitMedia = resolveSubmitMedia(pickedFile);
    const input: EndorsementSubmitInput = {
      topic: normalizedTopic,
      note: trimmedNote,
      ...(isEditing && existing?.id ? { id: existing.id } : {}),
      ...(submitMedia !== undefined ? { media: submitMedia } : {}),
      ...(isEditing
        ? { previousTopic: normalizeEndorsementTopic(existing?.topic ?? '') }
        : {}),
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
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1">
                  <h2
                    id="endorse-modal-title"
                    className="portal-eyebrow text-muted-foreground/55"
                  >
                    {isEditing || isTopicOverwrite
                      ? 'Update endorsement'
                      : 'Public endorsement'}
                  </h2>
                  <ModalCloseButton
                    ariaLabel="Close endorse modal"
                    onClick={() => handleOpenChange(false)}
                    disabled={isSaving}
                  />
                </div>

                <div className="px-5 pb-2" aria-live="polite">
                  <EndorsementRecordEditor
                    issuer={issuerAccountId ?? ''}
                    target={targetAccountId}
                    issuerName={partyDisplay.issuerName}
                    targetName={partyDisplay.targetName}
                    issuerAvatarUrl={partyDisplay.issuerAvatarUrl}
                    targetAvatarUrl={partyDisplay.targetAvatarUrl}
                    viewerAccountId={issuerAccountId}
                    issuerLabelOverride={issuerAccountId ? undefined : 'You'}
                    hideIssuerHandle={!issuerAccountId}
                    topic={topic}
                    onTopicChange={(value) => {
                      setTopic(value);
                      setError(null);
                    }}
                    note={note}
                    onNoteChange={(value) => {
                      setNote(value);
                      setError(null);
                    }}
                    topicMax={TOPIC_MAX}
                    noteMax={ENDORSEMENT_NOTE_LIMITS.max}
                    mediaUrl={previewMediaUrl}
                    mediaMime={previewMediaMime}
                    onRemoveMedia={
                      previewMediaUrl ? handleClearMedia : undefined
                    }
                    hasMediaAttachment={hasMediaAttachment}
                    noteFieldVisible={noteFieldVisible}
                    onNoteFieldVisibleChange={setNoteFieldVisible}
                    topicHint={topicHint}
                    suggestedTopics={SUGGESTED_TOPICS}
                    onSuggestedTopicPick={(value) => {
                      setTopic(value);
                      setError(null);
                    }}
                    showSuggestedTopics={showSuggestedTopics}
                    onTopicFocusChange={setTopicFocused}
                    timeLabel={
                      <span className="text-right portal-type-caption tabular-nums text-muted-foreground/40">
                        just now
                      </span>
                    }
                  />
                </div>

                {(error || mediaError) && (
                  <p className="mx-5 mb-2 rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs text-[var(--portal-red)]">
                    {error ?? mediaError}
                  </p>
                )}

                <div className="border-t border-fade-section px-5 py-2.5">
                  <input
                    ref={fileInputRef}
                    id={mediaInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleMediaPick(file);
                      event.target.value = '';
                    }}
                  />

                  <div className="flex min-h-9 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
                      aria-label={
                        hasMediaAttachment
                          ? 'Attach photo or video'
                          : `Attach photo or video. ${mediaLimitsHint}`
                      }
                    >
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    {!hasMediaAttachment ? (
                      <span className="min-w-0 truncate portal-type-caption text-muted-foreground/45">
                        <span className="sm:hidden">
                          {mediaLimitsHintShort}
                        </span>
                        <span className="hidden sm:inline">
                          {mediaLimitsHint}
                        </span>
                      </span>
                    ) : null}

                    <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 portal-type-caption tabular-nums text-muted-foreground/55">
                      {topicLength > 0 && topicLength < TOPIC_MIN ? (
                        <span className="text-amber-600">
                          {topicLength} / {TOPIC_MIN} topic min
                        </span>
                      ) : topicLength >= TOPIC_WARNING_THRESHOLD ? (
                        <span className="text-amber-600">
                          {topicLength} / {TOPIC_MAX}
                        </span>
                      ) : null}
                      {(hasNote || !hasMediaAttachment) && (
                        <span
                          className={getBoundedNoteCounterClass(
                            noteLength,
                            hasNote,
                            ENDORSEMENT_NOTE_LIMITS
                          )}
                        >
                          {getBoundedNoteCounterLabel(
                            noteLength,
                            ENDORSEMENT_NOTE_LIMITS
                          )}
                        </span>
                      )}
                      {hasMediaAttachment && !hasNote && !noteFieldVisible ? (
                        <button
                          type="button"
                          onClick={() => setNoteFieldVisible(true)}
                          className="text-muted-foreground/55 transition-colors hover:text-muted-foreground"
                        >
                          Add note
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-end gap-2">
                    {isEditing && onRemove ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemove}
                        loading={isSaving}
                        className="text-[var(--portal-red)] hover:text-[var(--portal-red)]"
                      >
                        Withdraw
                      </Button>
                    ) : null}

                    <Button
                      type="button"
                      variant="endorsement"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      loading={isSaving}
                      className="min-w-[5.5rem] focus-visible:ring-[var(--portal-gold-accent)]"
                      aria-label={
                        canSubmit
                          ? primaryActionFullLabel
                          : 'Complete the topic and add a note or media'
                      }
                    >
                      {isEditing || isTopicOverwrite ? 'Update' : 'Endorse'}
                    </Button>
                  </div>
                </div>

                <p className="border-t border-fade-section px-5 py-2.5 text-center portal-type-caption text-portal-neutral opacity-60">
                  Public on-chain · update or withdraw anytime
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
