'use client';

import { useCallback, useState } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PostComposerProps {
  onPosted?: () => void;
}

export function PostComposer({ onPosted }: PostComposerProps) {
  const { isConnected, isLoading, withClient } = useOnSocialWriter();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { client } = await withClient();
      const response = await client.posts.create({ text: trimmed });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        successMessage: txToastSuccess.postPublished,
        failureMessage: txToastError.postFailed,
      });
      if (!confirmed) return;
      setText('');
      onPosted?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.postFailed,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    onPosted,
    setTxResult,
    text,
    trackTransaction,
    withClient,
  ]);

  if (isLoading) {
    return <div className="post-composer is-loading" aria-hidden />;
  }

  if (!isConnected) {
    return (
      <section className="post-composer post-composer-guest">
        <p className="post-composer-lead">Connect your wallet to post.</p>
      </section>
    );
  }

  const canPost = Boolean(text.trim()) && !isSubmitting;

  return (
    <section className="post-composer">
      <label className="post-composer-label" htmlFor="home-compose">
        Share something
      </label>
      <textarea
        id="home-compose"
        className="post-composer-input"
        rows={3}
        placeholder="What's happening on NEAR?"
        value={text}
        disabled={isSubmitting}
        onChange={(event) => setText(event.target.value)}
      />
      <OsSheetActions
        layout="stack"
        tone="frosted-primary"
        borderless
        className="post-composer-actions"
      >
        <OsSheetAction
          type="button"
          variant="primary"
          ready={canPost}
          pending={isSubmitting}
          pendingLabel="Posting…"
          disabled={!canPost}
          onClick={() => void submit()}
        >
          Post
        </OsSheetAction>
      </OsSheetActions>
    </section>
  );
}
