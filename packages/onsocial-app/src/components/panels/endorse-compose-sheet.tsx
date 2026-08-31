'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  EndorsementTopicConflictError,
  normalizeEndorsementTopic,
  type MediaRef,
} from '@onsocial/sdk';
import {
  DiscardConfirmSheet,
  OsGestureSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { creditAppPlatformSocialReward } from '@/lib/app-platform-rewards';
import { humanizeEndorsementTopic } from '@/lib/endorsement-display';
import {
  ENDORSEMENT_IMAGE_MAX_BYTES,
  ENDORSEMENT_VIDEO_MAX_BYTES,
  ENDORSEMENT_VIDEO_MAX_SECONDS,
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
  resolveEndorsementOptimisticDraftMedia,
  validateEndorsementMediaFile,
} from '@/lib/endorsement-media';
import type { EndorseExistingDraft } from '@/lib/endorsements-panel-data';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const TOPIC_MAX = 40;
const NOTE_MAX = 280;
const SUGGESTED_TOPICS = [
  'Governance',
  'Design',
  'Product',
  'Community',
  'Research',
] as const;

/**
 * `auto` — face/drawer: load viewer’s latest vouch and edit if present.
 * `create` — panel Endorse: always a fresh vouch (multi-topic).
 * `edit` — row Edit: prefill the supplied draft.
 */
export type EndorseComposeIntent = 'auto' | 'create' | 'edit';

export interface EndorseComposeSheetProps {
  open: boolean;
  /** Endorsement target (the account being vouched for). */
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Page owner mood when already known (portfolio). Otherwise fetched. */
  mood?: ResolvedMood | null;
  intent?: EndorseComposeIntent;
  /** Required when `intent="edit"`. Ignored for `create`. */
  existing?: EndorseExistingDraft | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  zIndex?: number;
}

function mediaFingerprint(media: MediaRef | null): string {
  if (!media) return '';
  return `${media.cid}:${media.mime}`;
}

/**
 * Face Endorse compose — same hug gesture family as Support (host mood +
 * OsGestureSheet). Bordered type-ins so mood wash shows through. Edit/remove
 * via upsert; dirty close uses discard confirm; rewards on first create save.
 * Optional photo/video attach mirrors portal endorsement media.
 */
export function EndorseComposeSheet({
  open,
  pageAccountId,
  profileName = null,
  avatarUrl = null,
  mood = null,
  intent = 'auto',
  existing = null,
  onOpenChange,
  onSuccess,
  zIndex = SHEET_Z.gesture,
}: EndorseComposeSheetProps) {
  const titleId = useId();
  const mediaInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accountId, isConnected, connect } = useAppWallet();
  const viewerShell = useViewerProfileShellContext();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const {
    confirmEndorse,
    confirmEndorseRemove,
    setEndorsePendingForTarget,
  } = useViewerEndorsement(pageAccountId);
  const [closing, setClosing] = useState(false);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [baselineTopic, setBaselineTopic] = useState('');
  const [baselineNote, setBaselineNote] = useState('');
  const [endorsementId, setEndorsementId] = useState<string | null>(null);
  const [existingMedia, setExistingMedia] = useState<MediaRef | null>(null);
  const [baselineMediaFp, setBaselineMediaFp] = useState('');
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [mediaRemoved, setMediaRemoved] = useState(false);
  const [mediaProcessing, setMediaProcessing] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [noteFieldVisible, setNoteFieldVisible] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const name = displayName(pageAccountId, profileName ?? undefined);
  const handle = fallbackLabel(pageAccountId);
  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const fetchedMood = usePageOwnerMood(pageAccountId, open || closing);
  const effectiveMood = mood ?? fetchedMood;
  const panelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );

  const hasMediaAttachment =
    Boolean(mediaFile) || (!mediaRemoved && Boolean(existingMedia));
  const previewMediaUrl = mediaFile
    ? filePreviewUrl
    : !mediaRemoved
      ? existingMediaUrl
      : null;
  const previewMediaMime = mediaFile?.type ?? existingMedia?.mime ?? null;
  const currentMediaFp = mediaFile
    ? `file:${mediaFile.name}:${mediaFile.size}:${mediaFile.lastModified}`
    : mediaRemoved
      ? ''
      : mediaFingerprint(existingMedia);
  const mediaDirty = currentMediaFp !== baselineMediaFp;

  const dirty =
    topic.trim() !== baselineTopic.trim() ||
    note.trim() !== baselineNote.trim() ||
    mediaDirty;
  const busy = pending || removing || loadingExisting || mediaProcessing;

  const mediaLimitsHint = `Photo ≤${Math.round(ENDORSEMENT_IMAGE_MAX_BYTES / (1024 * 1024))} MB · video ≤${Math.round(ENDORSEMENT_VIDEO_MAX_BYTES / (1024 * 1024))} MB, ${ENDORSEMENT_VIDEO_MAX_SECONDS}s`;

  const finishClose = useCallback(() => {
    setClosing(true);
  }, []);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open,
    dirty,
    pending: busy,
    onClose: finishClose,
  });

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setFieldError(null);
    setMediaError(null);
    setPending(false);
    setRemoving(false);
    setMediaProcessing(false);

    const clearLocalMedia = () => {
      setMediaFile(null);
      setMediaRemoved(false);
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(null);
    };

    const applyDraft = (
      draft: EndorseExistingDraft | null,
      editing: boolean
    ) => {
      const nextTopic = humanizeEndorsementTopic(draft?.topic);
      const nextNote = draft?.note?.trim() ?? '';
      const nextMedia = parseEndorsementMediaRef(draft?.media);
      const nextMediaUrl =
        draft?.mediaUrl?.trim() ||
        resolveEndorsementDisplayMediaUrl({
          media: nextMedia,
          mediaUrl: draft?.mediaUrl,
        });
      setTopic(nextTopic);
      setNote(nextNote);
      setBaselineTopic(nextTopic);
      setBaselineNote(nextNote);
      setEndorsementId(
        typeof draft?.id === 'string' && draft.id.trim()
          ? draft.id.trim()
          : null
      );
      setExistingMedia(nextMedia);
      setExistingMediaUrl(nextMediaUrl);
      setBaselineMediaFp(mediaFingerprint(nextMedia));
      clearLocalMedia();
      setNoteFieldVisible(Boolean(nextNote) || !nextMedia);
      setIsEditing(editing);
    };

    if (intent === 'edit') {
      applyDraft(existing ?? null, true);
      setLoadingExisting(false);
      return;
    }

    if (intent === 'create') {
      applyDraft(null, false);
      setLoadingExisting(false);
      return;
    }

    applyDraft(null, false);

    if (!isConnected || isSelf || !accountId) {
      setLoadingExisting(false);
      return;
    }

    setLoadingExisting(true);
    void (async () => {
      try {
        const { client } = await getClient();
        const rows = await client.endorsements.listFromViewerToTarget(
          accountId,
          pageAccountId,
          { limit: 8 }
        );
        if (cancelled) return;
        const latest = rows[0] ?? null;
        if (latest) {
          const media = parseEndorsementMediaRef(latest.media);
          applyDraft(
            {
              id: typeof latest.id === 'string' ? latest.id : null,
              topic: latest.topic ?? null,
              note: latest.note ?? null,
              media,
              mediaUrl: resolveEndorsementDisplayMediaUrl({ media }),
            },
            true
          );
        }
      } catch {
        /* Prefill is best-effort — compose still works for a fresh vouch. */
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // filePreviewUrl intentionally omitted — cleared inside applyDraft.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open reset only
  }, [
    open,
    intent,
    existing,
    isConnected,
    isSelf,
    accountId,
    pageAccountId,
    getClient,
  ]);

  const requestClose = useCallback(() => {
    if (!requestCloseOrConfirm()) return;
    finishClose();
  }, [finishClose, requestCloseOrConfirm]);

  const handleSheetClosed = useCallback(() => {
    clearDiscardConfirm();
    setClosing(false);
    onOpenChange(false);
  }, [clearDiscardConfirm, onOpenChange]);

  const handleMediaPick = async (file: File | null) => {
    setMediaError(null);
    setFieldError(null);
    if (!file) return;
    setMediaProcessing(true);
    try {
      const validationError = await validateEndorsementMediaFile(file);
      if (validationError) {
        setMediaError(validationError);
        return;
      }
      setMediaFile(file);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(URL.createObjectURL(file));
      setMediaRemoved(false);
      if (!note.trim()) {
        setNoteFieldVisible(false);
      }
    } finally {
      setMediaProcessing(false);
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
    setFieldError(null);
    setNoteFieldVisible(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resolveSubmitMedia = (): File | MediaRef | null | undefined => {
    if (mediaFile) return mediaFile;
    if (mediaRemoved) return null;
    if (existingMedia) return existingMedia;
    return undefined;
  };

  const canSubmit = !isSelf && isConnected && !busy && (!isEditing || dirty);

  async function handleSubmit() {
    setFieldError(null);

    if (!isConnected) {
      await connect();
      return;
    }
    if (isSelf) {
      setFieldError('You can’t endorse yourself.');
      return;
    }
    if (mediaError) {
      setFieldError(mediaError);
      return;
    }

    const normalizedTopic = normalizeEndorsementTopic(topic);
    const trimmedNote = note.trim();
    if (trimmedNote.length > NOTE_MAX) {
      setFieldError(`Note must be ${NOTE_MAX} characters or fewer.`);
      return;
    }

    const submitMedia = resolveSubmitMedia();

    setPending(true);
    setEndorsePendingForTarget(pageAccountId, true);
    try {
      const { client, session } = await getClient();
      // When editing, always pass previousTopic ('' = general path) so topic
      // moves withdraw the prior slot — including general → named.
      const response = await client.endorsements.upsert(
        pageAccountId,
        {
          ...(normalizedTopic ? { topic: normalizedTopic } : {}),
          ...(trimmedNote
            ? { note: trimmedNote }
            : isEditing
              ? { note: '' }
              : {}),
          ...(isEditing && endorsementId ? { id: endorsementId } : {}),
          ...(submitMedia !== undefined ? { media: submitMedia } : {}),
        },
        {
          ...(isEditing
            ? {
                previousTopic: normalizeEndorsementTopic(baselineTopic) ?? '',
              }
            : {}),
          wait: true,
        }
      );

      if (!isEditing && accountId && session) {
        creditAppPlatformSocialReward({
          accountId,
          action: 'endorsement_given',
          targetAccountId: pageAccountId,
          targetDisplayName: name,
          topic: humanizeEndorsementTopic(normalizedTopic) || undefined,
          proof: { txHash: response.txHash ?? '' },
          session,
        });
      }

      confirmEndorse(pageAccountId, normalizedTopic ?? '', {
        ...(isEditing
          ? { previousTopic: normalizeEndorsementTopic(baselineTopic) ?? '' }
          : {}),
        snapshot: {
          accountId: pageAccountId,
          name: profileName,
          avatarUrl,
        },
        ...(accountId
          ? {
              issuerSnapshot: {
                accountId,
                name: viewerShell?.displayName ?? null,
                avatarUrl: viewerShell?.avatarUrl ?? null,
              },
            }
          : {}),
        draft: {
          topic: normalizedTopic ?? '',
          note: trimmedNote || null,
          id: endorsementId,
          ...resolveEndorsementOptimisticDraftMedia({
            mediaRemoved,
            mediaFile,
            existingMedia,
            existingMediaUrl,
          }),
        },
      });
      onSuccess?.();
      finishClose();
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      if (error instanceof EndorsementTopicConflictError) {
        setFieldError(error.message);
        return;
      }
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.endorsementFailed,
      });
    } finally {
      setPending(false);
      setEndorsePendingForTarget(pageAccountId, false);
    }
  }

  async function handleRemove() {
    if (!isEditing || !isConnected || isSelf) return;
    setFieldError(null);
    setRemoving(true);
    setEndorsePendingForTarget(pageAccountId, true);
    try {
      const { client } = await getClient();
      const topicForRemove = normalizeEndorsementTopic(baselineTopic);
      await client.endorsements.remove(pageAccountId, {
        ...(topicForRemove ? { topic: topicForRemove } : {}),
        wait: true,
      });
      confirmEndorseRemove(pageAccountId, topicForRemove ?? '');
      onSuccess?.();
      finishClose();
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.endorsementFailed,
      });
    } finally {
      setRemoving(false);
      setEndorsePendingForTarget(pageAccountId, false);
    }
  }

  const verb = isEditing ? 'Edit endorsement' : 'Endorse';
  const primaryLabel = !isConnected
    ? 'Connect wallet'
    : isEditing
      ? dirty
        ? 'Save endorsement'
        : 'Saved'
      : 'Endorse';

  return (
    <>
      <OsGestureSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        verb={verb}
        personName={name}
        handle={handle}
        signal="endorse"
        closeAriaLabel="Close endorse"
        backdropLabel="Close endorse"
        moodId={effectiveMood?.id}
        panelStyle={panelStyle}
        size="compact"
        bodyClassName="profile-support-sheet-body"
        titleId={titleId}
        zIndex={zIndex}
      >
        <div className="endorse-compose-form">
          <label className="endorse-compose-field">
            <span className="endorse-compose-label">Topic</span>
            <input
              type="text"
              value={topic}
              maxLength={TOPIC_MAX}
              autoComplete="off"
              placeholder="e.g. Design"
              className={`${osFieldBorderedClassName} endorse-compose-input`}
              disabled={busy || isSelf || discardConfirmOpen}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>

          <div
            className="endorse-compose-suggestions"
            role="group"
            aria-label="Suggested topics"
          >
            {SUGGESTED_TOPICS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={`endorse-compose-chip${
                  topic.trim().toLowerCase() === suggestion.toLowerCase()
                    ? ' is-selected'
                    : ''
                }`}
                disabled={busy || isSelf || discardConfirmOpen}
                onClick={() => setTopic(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="endorse-compose-field">
            <span className="endorse-compose-label">
              Note
              {noteFieldVisible || note.trim() || !hasMediaAttachment ? (
                <span className="endorse-compose-counter">
                  {note.trim().length}/{NOTE_MAX}
                </span>
              ) : null}
            </span>
            {noteFieldVisible || note.trim() || !hasMediaAttachment ? (
              <textarea
                value={note}
                maxLength={NOTE_MAX}
                rows={3}
                placeholder="Optional — what you’re vouching for"
                className={`${osFieldBorderedClassName} endorse-compose-textarea`}
                disabled={busy || isSelf || discardConfirmOpen}
                onChange={(event) => setNote(event.target.value)}
              />
            ) : (
              <button
                type="button"
                className="endorse-compose-add-note"
                disabled={busy || isSelf || discardConfirmOpen}
                onClick={() => setNoteFieldVisible(true)}
              >
                Add a note
              </button>
            )}
          </div>

          <div className="endorse-compose-media">
            <input
              ref={fileInputRef}
              id={mediaInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              className="sr-only"
              disabled={busy || isSelf || discardConfirmOpen}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleMediaPick(file);
              }}
            />
            {previewMediaUrl ? (
              <div className="endorse-compose-media-preview">
                {previewMediaMime?.toLowerCase().startsWith('video/') ? (
                  <video
                    src={previewMediaUrl}
                    className="endorse-compose-media-el"
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={previewMediaUrl}
                    alt={existingMedia?.alt?.trim() || 'Endorsement media'}
                    className="endorse-compose-media-el"
                  />
                )}
                <button
                  type="button"
                  className="endorse-compose-media-remove"
                  disabled={busy || discardConfirmOpen}
                  onClick={handleClearMedia}
                >
                  Remove media
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="endorse-compose-media-attach"
                disabled={busy || isSelf || discardConfirmOpen}
                onClick={() => fileInputRef.current?.click()}
              >
                {mediaProcessing ? 'Checking media…' : 'Attach photo or video'}
              </button>
            )}
            {!hasMediaAttachment ? (
              <p className="endorse-compose-media-hint">{mediaLimitsHint}</p>
            ) : null}
          </div>

          {fieldError || mediaError ? (
            <p className="endorse-compose-error" role="alert">
              {fieldError ?? mediaError}
            </p>
          ) : isSelf ? (
            <p className="endorse-compose-hint">You can’t endorse yourself.</p>
          ) : !isConnected ? (
            <p className="endorse-compose-hint">
              Connect to put your name behind them.
            </p>
          ) : loadingExisting ? (
            <p className="endorse-compose-hint">Loading your vouch…</p>
          ) : isEditing ? (
            <p className="endorse-compose-hint">
              Editing your public vouch — change topic to move it.
            </p>
          ) : (
            <p className="endorse-compose-hint">
              Public vouch — topic, note, and media are optional.
            </p>
          )}

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canSubmit || !isConnected}
              pending={pending}
              pendingLabel={isEditing ? 'Saving…' : 'Endorsing…'}
              disabled={busy}
              onClick={() => void handleSubmit()}
            >
              {primaryLabel}
            </OsSheetAction>
            {isEditing ? (
              <OsSheetAction
                type="button"
                variant="ghost"
                ready={!busy}
                pending={removing}
                pendingLabel="Removing…"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                Remove endorsement
              </OsSheetAction>
            ) : null}
          </OsSheetActions>
        </div>
      </OsGestureSheet>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
        title="Discard endorsement?"
        body="Your topic, note, and media won’t be saved."
      />
    </>
  );
}
