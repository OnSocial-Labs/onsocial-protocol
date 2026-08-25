'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ImageIcon,
  OsIconAction,
  PulsingDots,
  osFieldSoftClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { sendEncryptedDm } from '@/lib/dm/send';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MOBILE_MAX_WIDTH_PX = 767;

function shouldSendOnEnterKey(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

type DmThreadComposerProps = {
  peerAccountId: string;
  disabled?: boolean;
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const clearMedia = () => {
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

    setPending(true);
    try {
      const { client, session, wallet } = await getClient();
      if (!session) {
        setError('Connect your session to send private messages.');
        return;
      }
      const result = await sendEncryptedDm({
        client,
        accountId,
        wallet,
        session,
        recipientAccountId: peerAccountId,
        text,
        mediaFile,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText('');
      clearMedia();
      if (result.recoveryCode) onRecoveryCode?.(result.recoveryCode);
      onSent?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not send message.'
      );
    } finally {
      setPending(false);
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
        disabled={pending || disabled}
        onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
      />

      {previewUrl && mediaFile ? (
        <div className="messages-composer-preview">
          {mediaFile.type.startsWith('video/') ? (
            <video
              src={previewUrl}
              className="messages-composer-preview-el"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={previewUrl}
              alt=""
              className="messages-composer-preview-el"
            />
          )}
          <button
            type="button"
            className="messages-composer-preview-remove"
            disabled={pending || disabled}
            onClick={clearMedia}
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="messages-composer-bar">
        <OsIconAction
          ariaLabel="Attach photo or video"
          disabled={pending || disabled}
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
          disabled={pending || disabled}
        />
        <button
          type="submit"
          className="messages-composer-send"
          disabled={pending || disabled || (!canSend && isConnected)}
        >
          {pending ? (
            <PulsingDots size="sm" label="Sending" />
          ) : !isConnected ? (
            'Connect'
          ) : (
            'Send'
          )}
        </button>
      </div>

      {error ? (
        <p className="dm-compose-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
