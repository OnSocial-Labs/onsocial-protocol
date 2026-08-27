'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { OsWriteDockReplyChip } from '@/components/os/os-write-dock';
import { useRegisterWriteDock } from '@/contexts/compose-launcher-context';
import { writeDockDraftKey } from '@/lib/os-write-dock';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { normalizeDmReplyToMessageId } from '@/lib/dm/crypto';
import { DM_PEER_MESSAGES_UNAVAILABLE } from '@/lib/dm/copy';
import { sendEncryptedDm } from '@/lib/dm/send';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { createDmOutgoingLocalId } from '@/features/messages/dm-outgoing';

type DmComposerReply = {
  messageId: string;
  preview: string;
};

type DmThreadComposerProps = {
  peerAccountId: string;
  disabled?: boolean;
  disabledReason?: string | null;
  replyTo?: DmComposerReply | null;
  onCancelReply?: () => void;
  onOutgoingStart?: (draft: {
    localId: string;
    text: string;
    peerAccountId: string;
    replyToMessageId?: string;
    mediaFile?: File | null;
    mediaPreviewUrl?: string | null;
    mediaMime?: string | null;
  }) => void;
  onOutgoingConfirm?: (opts: {
    localId: string;
    messageId: string;
    threadId: string;
  }) => void;
  onOutgoingFail?: (opts: {
    localId: string;
    error: string;
    needsUnlock?: boolean;
  }) => void;
  onOutgoingCancel?: (localId: string) => void;
  onSent?: () => void;
  /** First-time key create — parent shows recovery sheet. */
  onRecoveryCode?: (code: string) => void;
};

/**
 * Registers the shared write dock for an open thread on `/messages`.
 * Profile “Message” still uses {@link DmComposeSheet}.
 */
export function DmThreadComposer({
  peerAccountId,
  disabled = false,
  disabledReason = null,
  replyTo = null,
  onCancelReply,
  onOutgoingStart,
  onOutgoingConfirm,
  onOutgoingFail,
  onOutgoingCancel,
  onSent,
  onRecoveryCode,
}: DmThreadComposerProps) {
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

  const handleSubmit = useCallback(
    async (payload: { text: string; files: File[] }) => {
      setError(null);
      if (!isConnected || !accountId) {
        await connect();
        return false;
      }
      if (!hasSocialSession) {
        setError('Connect your session to send private messages.');
        return false;
      }
      if (disabled) return false;
      if (!payload.text.trim() && !payload.files.length) return false;
      if (submitLockRef.current) return false;
      submitLockRef.current = true;

      const localId = createDmOutgoingLocalId();
      const outgoingText = payload.text;
      const outgoingMedia = payload.files[0] ?? null;
      const replyToMessageId = normalizeDmReplyToMessageId(replyTo?.messageId);

      try {
        onOutgoingStart?.({
          localId,
          text: outgoingText.trim(),
          peerAccountId,
          replyToMessageId,
          mediaFile: outgoingMedia,
          mediaMime: outgoingMedia?.type ?? null,
        });
        onCancelReply?.();
        const { client, session, wallet } = await getClient();
        if (!session) {
          onOutgoingFail?.({
            localId,
            error: 'Connect your session to send private messages.',
          });
          return false;
        }
        const result = await sendEncryptedDm({
          client,
          accountId,
          wallet,
          session,
          recipientAccountId: peerAccountId,
          text: outgoingText,
          mediaFile: outgoingMedia,
          replyToMessageId,
        });
        if (!result.ok) {
          onOutgoingFail?.({
            localId,
            error: result.error,
            needsUnlock: result.needsUnlock,
          });
          return false;
        }
        onOutgoingConfirm?.({
          localId,
          messageId: result.messageId,
          threadId: result.threadId,
        });
        if (result.recoveryCode) onRecoveryCode?.(result.recoveryCode);
        onSent?.();
        return true;
      } catch (cause) {
        if (isWalletUserCancellation(cause)) {
          onOutgoingCancel?.(localId);
          return false;
        }
        onOutgoingFail?.({
          localId,
          error:
            cause instanceof Error ? cause.message : 'Could not send message.',
        });
        return false;
      } finally {
        submitLockRef.current = false;
      }
    },
    [
      accountId,
      connect,
      disabled,
      getClient,
      hasSocialSession,
      isConnected,
      onCancelReply,
      onOutgoingCancel,
      onOutgoingConfirm,
      onOutgoingFail,
      onOutgoingStart,
      onRecoveryCode,
      onSent,
      peerAccountId,
      replyTo?.messageId,
    ]
  );

  const peerUnavailable = disabled && Boolean(disabledReason);
  const composeLabel = peerUnavailable
    ? (disabledReason ?? DM_PEER_MESSAGES_UNAVAILABLE)
    : replyTo
      ? 'Reply'
      : 'Message';

  const above = useMemo(() => {
    if (!replyTo || !onCancelReply) return null;
    return (
      <OsWriteDockReplyChip
        label={replyTo.preview}
        onCancel={onCancelReply}
      />
    );
  }, [onCancelReply, replyTo]);

  useRegisterWriteDock({
    placeholder: composeLabel,
    ariaLabel: composeLabel,
    disabled,
    error,
    above,
    revision: `${replyTo?.messageId ?? ''}:${peerUnavailable ? '1' : '0'}:${error ?? ''}`,
    draftKey: writeDockDraftKey('dm', peerAccountId),
    onSubmit: handleSubmit,
  });

  return null;
}
