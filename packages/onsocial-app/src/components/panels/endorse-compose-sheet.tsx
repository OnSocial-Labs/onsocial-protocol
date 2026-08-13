'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { normalizeEndorsementTopic } from '@onsocial/sdk';
import {
  Divider,
  GlassSheet,
  osFieldSoftClassName,
  useScrollLock,
} from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { accountIdsEqual } from '@/lib/account-match';
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

interface EndorseComposeSheetProps {
  open: boolean;
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EndorseComposeSheet({
  open,
  pageAccountId,
  profileName = null,
  avatarUrl: _avatarUrl = null,
  onOpenChange,
  onSuccess,
}: EndorseComposeSheetProps) {
  void _avatarUrl;
  const titleId = useId();
  const { accountId, isConnected, connect } = useAppWallet();
  const { withClient } = useOnSocialWriter();
  const { setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const name = displayName(pageAccountId, profileName ?? undefined);
  const handle = fallbackLabel(pageAccountId);
  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);

  useScrollLock(open || closing);

  useEffect(() => {
    if (!open) return;
    setTopic('');
    setNote('');
    setFieldError(null);
    setPending(false);
  }, [open]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const canSubmit = !isSelf && isConnected && !pending;

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
      const { client } = await withClient();
      await client.endorsements.add(
        pageAccountId,
        {
          ...(normalizedTopic ? { topic: normalizedTopic } : {}),
          ...(trimmedNote ? { note: trimmedNote } : {}),
        },
        { wait: true }
      );
      onSuccess?.();
      setClosing(true);
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
      setPending(false);
    }
  }

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      sizing="hug"
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close endorse"
      bodyClassName="endorse-compose-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Endorse"
            personName={name}
            handle={handle}
            signal="endorse"
            closeAriaLabel="Close endorse"
            onClose={requestClose}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
            className={`${osFieldSoftClassName} endorse-compose-input}`}
            disabled={pending || isSelf}
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
              disabled={pending || isSelf}
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
            className={`${osFieldSoftClassName} endorse-compose-textarea}`}
            disabled={pending || isSelf}
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
        ) : (
          <p className="endorse-compose-hint">
            Public vouch — topic optional, note optional.
          </p>
        )}

        <OsSheetActions layout="stack">
          <OsSheetAction
            type="button"
            ready={canSubmit || !isConnected}
            pending={pending}
            pendingLabel="Saving endorsement"
            onClick={() => void handleSubmit()}
          >
            {isConnected ? 'Endorse' : 'Connect wallet'}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </GlassSheet>
  );
}
