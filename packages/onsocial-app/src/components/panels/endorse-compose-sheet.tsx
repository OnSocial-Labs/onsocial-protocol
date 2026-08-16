'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  EndorsementTopicConflictError,
  normalizeEndorsementTopic,
} from '@onsocial/sdk';
import {
  DiscardConfirmFooter,
  OsGestureSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { creditAppPlatformSocialReward } from '@/lib/app-platform-rewards';
import {
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import type { EndorseExistingDraft } from '@/lib/endorsements-panel-data';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';
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

export interface EndorseComposeSheetProps {
  open: boolean;
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Page owner mood when already known (portfolio). Otherwise fetched. */
  mood?: ResolvedMood | null;
  /**
   * Prefill when editing a known row. When omitted, the sheet loads the
   * viewer’s most recent vouch to this target (if any).
   */
  existing?: EndorseExistingDraft | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Face Endorse compose — same hug gesture family as Support (host mood +
 * OsGestureSheet). Bordered type-ins so mood wash shows through. Edit/remove
 * via upsert; dirty close uses discard confirm; rewards on first save.
 */
export function EndorseComposeSheet({
  open,
  pageAccountId,
  profileName = null,
  avatarUrl: _avatarUrl = null,
  mood = null,
  existing = null,
  onOpenChange,
  onSuccess,
}: EndorseComposeSheetProps) {
  void _avatarUrl;
  const titleId = useId();
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [baselineTopic, setBaselineTopic] = useState('');
  const [baselineNote, setBaselineNote] = useState('');
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

  const dirty =
    topic.trim() !== baselineTopic.trim() ||
    note.trim() !== baselineNote.trim();
  const busy = pending || removing || loadingExisting;

  const finishClose = useCallback(() => {
    setClosing(true);
  }, []);

  const {
    discardConfirmOpen,
    discardTitleId,
    discardBodyId,
    keepEditingRef,
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
    if (!open) return;

    let cancelled = false;
    setFieldError(null);
    setPending(false);
    setRemoving(false);

    const applyDraft = (draft: EndorseExistingDraft | null, editing: boolean) => {
      const nextTopic = humanizeEndorsementTopic(draft?.topic);
      const nextNote = draft?.note?.trim() ?? '';
      setTopic(nextTopic);
      setNote(nextNote);
      setBaselineTopic(nextTopic);
      setBaselineNote(nextNote);
      setIsEditing(editing);
    };

    if (existing) {
      applyDraft(existing, true);
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
          applyDraft(
            { topic: latest.topic ?? null, note: latest.note ?? null },
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
  }, [
    open,
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

  const canSubmit =
    !isSelf &&
    isConnected &&
    !busy &&
    (!isEditing || dirty);

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

    const normalizedTopic = normalizeEndorsementTopic(topic);
    const trimmedNote = note.trim();
    if (trimmedNote.length > NOTE_MAX) {
      setFieldError(`Note must be ${NOTE_MAX} characters or fewer.`);
      return;
    }

    setPending(true);
    try {
      const { client, session } = await getClient();
      const previousTopic = isEditing
        ? normalizeEndorsementTopic(baselineTopic)
        : undefined;
      const response = await client.endorsements.upsert(
        pageAccountId,
        {
          ...(normalizedTopic ? { topic: normalizedTopic } : {}),
          ...(trimmedNote ? { note: trimmedNote } : {}),
        },
        {
          ...(previousTopic !== undefined ? { previousTopic } : {}),
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
    }
  }

  async function handleRemove() {
    if (!isEditing || !isConnected || isSelf) return;
    setFieldError(null);
    setRemoving(true);
    try {
      const { client } = await getClient();
      const topicForRemove = normalizeEndorsementTopic(baselineTopic);
      await client.endorsements.remove(pageAccountId, {
        ...(topicForRemove ? { topic: topicForRemove } : {}),
        wait: true,
      });
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
      bodyClassName="endorse-compose-body"
      titleId={titleId}
      zIndex={56}
      footer={
        discardConfirmOpen ? (
          <DiscardConfirmFooter
            titleId={discardTitleId}
            bodyId={discardBodyId}
            onDiscard={discard}
            onKeepEditing={keepEditing}
            keepEditingRef={keepEditingRef}
            title="Discard endorsement?"
            body="Your topic and note won’t be saved."
          />
        ) : undefined
      }
    >
      <div
        className={`endorse-compose-form${
          discardConfirmOpen ? ' is-discard-confirm' : ''
        }`}
      >
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

        <label className="endorse-compose-field">
          <span className="endorse-compose-label">
            Note
            <span className="endorse-compose-counter">
              {note.trim().length}/{NOTE_MAX}
            </span>
          </span>
          <textarea
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Optional — what you’re vouching for"
            className={`${osFieldBorderedClassName} endorse-compose-textarea`}
            disabled={busy || isSelf || discardConfirmOpen}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {fieldError ? (
          <p className="endorse-compose-error" role="alert">
            {fieldError}
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
            Public vouch — topic optional, note optional.
          </p>
        )}

        {!discardConfirmOpen ? (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canSubmit || !isConnected}
              pending={pending}
              pendingLabel={isEditing ? 'Saving…' : 'Endorsing…'}
              disabled={busy || discardConfirmOpen}
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
        ) : null}
      </div>
    </OsGestureSheet>
  );
}
