'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  OsField,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { sendEncryptedDm } from '@/lib/dm/send';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

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

  const clearMedia = () => {
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSend = Boolean(text.trim() || mediaFile) && !disabled;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      className="messages-thread-composer"
      onSubmit={(e) => void handleSubmit(e)}
      aria-label="Reply"
    >
      <OsField label="Reply" htmlFor="dm-thread-reply">
        <textarea
          id="dm-thread-reply"
          className={osFieldBorderedClassName}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a reply…"
          rows={2}
          disabled={pending || disabled}
        />
      </OsField>

      <div className="dm-compose-media">
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
          <div className="dm-compose-media-preview">
            {mediaFile.type.startsWith('video/') ? (
              <video
                src={previewUrl}
                className="dm-compose-media-el"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img src={previewUrl} alt="" className="dm-compose-media-el" />
            )}
            <button
              type="button"
              className="dm-compose-media-remove"
              disabled={pending || disabled}
              onClick={clearMedia}
            >
              Remove media
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dm-compose-media-attach"
            disabled={pending || disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            Attach photo or video
          </button>
        )}
      </div>

      {error ? (
        <p className="dm-compose-error" role="alert">
          {error}
        </p>
      ) : null}

      <OsSheetActions>
        <OsSheetAction
          type="submit"
          ready={canSend && !pending}
          pending={pending}
          pendingLabel="Sending…"
        >
          {!isConnected ? 'Connect wallet' : 'Send'}
        </OsSheetAction>
      </OsSheetActions>
    </form>
  );
}
