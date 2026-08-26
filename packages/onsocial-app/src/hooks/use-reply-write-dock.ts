'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useRegisterWriteDock,
  type WriteDockRegistration,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { dispatchPersonalReplyConfirmed } from '@/features/scarces/drop-compose-host';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  writeDockDraftKey,
  writeDockReplyPlaceholder,
} from '@/lib/os-write-dock';
import { postKey } from '@/lib/post-display';

export function useReplyWriteDock({
  target,
  enabled,
  placeholder,
  above,
  revision,
  draftKey,
  onExpand,
  onConfirmed,
}: {
  target: PostRow | null;
  enabled: boolean;
  placeholder?: string;
  above?: ReactNode;
  revision?: string;
  draftKey?: string;
  onExpand?: (payload: WriteDockSubmit) => void;
  onConfirmed?: (reply: PostRow, target: PostRow) => void;
}) {
  const { isConnected, connect, accountId } = useAppWallet();
  const { withClient } = useOnSocialWriter();
  const { trackTransaction } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (payload: { text: string; files: File[] }) => {
      if (!target) return false;
      if (!isConnected || !accountId) {
        await connect();
        return false;
      }
      if (pending) return false;
      setPending(true);
      setError(null);
      try {
        const { client } = await withClient();
        const result = await submitPersonalPost({
          client,
          accountId,
          mode: 'reply',
          target,
          payload,
          trackTransaction,
        });
        if (result.confirmed && result.optimisticPost) {
          dispatchPersonalReplyConfirmed({
            parent: target,
            reply: result.optimisticPost,
          });
          onConfirmed?.(result.optimisticPost, target);
          return true;
        }
        return false;
      } catch (cause) {
        if (!isWalletUserCancellation(cause)) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not reply to this post.'
          );
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [
      accountId,
      connect,
      isConnected,
      onConfirmed,
      pending,
      target,
      trackTransaction,
      withClient,
    ]
  );

  const entry = useMemo<WriteDockRegistration | null>(() => {
    if (!enabled || !target) return null;
    return {
      placeholder: placeholder ?? writeDockReplyPlaceholder(),
      ariaLabel: placeholder ?? 'Reply',
      pending,
      error,
      above,
      revision,
      draftKey: draftKey ?? writeDockDraftKey('post', postKey(target)),
      onExpand,
      onSubmit: submit,
    };
  }, [
    above,
    draftKey,
    enabled,
    error,
    onExpand,
    pending,
    placeholder,
    revision,
    submit,
    target,
  ]);

  useRegisterWriteDock(entry);
}
