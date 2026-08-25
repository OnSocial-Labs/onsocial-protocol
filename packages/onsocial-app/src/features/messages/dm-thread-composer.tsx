'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ImageIcon,
  OsIconAction,
  osFieldSoftClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { normalizeDmReplyToMessageId } from '@/lib/dm/crypto';
import { sendEncryptedDm } from '@/lib/dm/send';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { createDmOutgoingLocalId } from '@/features/messages/dm-outgoing';

const MOBILE_MAX_WIDTH_PX = 767;
const mediaPreviewUrls = new WeakMap<File, string>();

function mediaPreviewUrlFor(file: File | null): string | null {
  if (!file) return null;
  const cached = mediaPreviewUrls.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  mediaPreviewUrls.set(file, url);
  return url;
}

function revokeMediaPreview(file: File | null) {
  if (!file) return;
  const url = mediaPreviewUrls.get(file);
  if (!url) return;
  URL.revokeObjectURL(url);
  mediaPreviewUrls.delete(file);
}

function shouldSendOnEnterKey(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

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
 * Inline reply composer for an open thread on `/messages`.
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
  const mediaInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll<HTMLTextAreaElement>();
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const mediaPreviewUrl = mediaPreviewUrlFor(mediaFile);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const clearMedia = () => {
    revokeMediaPreview(mediaFile);
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSend = Boolean(text.trim() || mediaFile) && !disabled;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (!isConnected || !accountId) {
      await connect();
      return;
    }
    if (!hasSocialSession) {
      setError('Connect your session to send private messages.');
      return;
    }
    if (!canSend) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    const localId = createDmOutgoingLocalId();
    const outgoingText = text;
    const outgoingMedia = mediaFile;
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
      setText('');
      clearMedia();
      onCancelReply?.();
      const { client, session, wallet } = await getClient();
      if (!session) {
        onOutgoingFail?.({
          localId,
          error: 'Connect your session to send private messages.',
        });
        return;
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
        return;
      }
      onOutgoingConfirm?.({
        localId,
        messageId: result.messageId,
        threadId: result.threadId,
      });
      if (result.recoveryCode) onRecoveryCode?.(result.recoveryCode);
      onSent?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) {
        onOutgoingCancel?.(localId);
        setText(outgoingText);
        if (outgoingMedia) setMediaFile(outgoingMedia);
        return;
      }
      onOutgoingFail?.({
        localId,
        error:
          cause instanceof Error ? cause.message : 'Could not send message.',
      });
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <form
      className="messages-composer"
      onSubmit={(e) => void handleSubmit(e)}
      aria-label="Reply"
    >
      <input
        ref={fileInputRef}
        id={mediaInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
      />

      {replyTo ? (
        <div className="messages-composer-reply">
          <p className="messages-composer-reply-copy">
            <span>Replying</span>
            {replyTo.preview}
          </p>
          <button
            type="button"
            className="messages-composer-reply-cancel"
            onClick={onCancelReply}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {mediaPreviewUrl && mediaFile ? (
        <div className="messages-composer-preview">
          {mediaFile.type.startsWith('video/') ? (
            <video
              src={mediaPreviewUrl}
              className="messages-composer-preview-el"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={mediaPreviewUrl}
              alt=""
              className="messages-composer-preview-el"
            />
          )}
          <button
            type="button"
            className="messages-composer-preview-remove"
            disabled={disabled}
            onClick={clearMedia}
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="messages-composer-bar">
        <OsIconAction
          ariaLabel="Attach photo or video"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="glass-sheet-close-icon" aria-hidden />
        </OsIconAction>
        <textarea
          ref={textRef}
          id={`${mediaInputId}-reply`}
          className={`${osFieldSoftClassName} messages-composer-input`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={scrollFieldIntoView}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              !shouldSendOnEnterKey()
            ) {
              return;
            }
            event.preventDefault();
            void handleSubmit();
          }}
          placeholder="Message"
          aria-label="Message"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          rows={1}
          disabled={disabled}
        />
        <button
          type="submit"
          className="messages-composer-send"
          disabled={disabled || (!canSend && isConnected)}
        >
          {!isConnected ? 'Connect' : 'Send'}
        </button>
      </div>

      {disabledReason ? (
        <p className="dm-compose-error" role="status">
          {disabledReason}
        </p>
      ) : error ? (
        <p className="dm-compose-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
