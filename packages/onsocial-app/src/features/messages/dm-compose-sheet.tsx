'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  DiscardConfirmFooter,
  OsField,
  OsGestureSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { sendEncryptedDm } from '@/lib/dm/send';
import { messagesPath } from '@/lib/app-routes';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';

interface DmComposeSheetProps {
  open: boolean;
  peerAccountId: string;
  peerName?: string | null;
  mood?: ResolvedMood | null;
  onClose: () => void;
  onSent?: () => void;
}

export function DmComposeSheet({
  open,
  peerAccountId,
  peerName,
  mood = null,
  onClose,
  onSent,
}: DmComposeSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const mediaInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const name = displayName(peerAccountId, peerName ?? undefined);
  const handle = fallbackLabel(peerAccountId);
  const fetchedMood = usePageOwnerMood(
    peerAccountId,
    Boolean(peerAccountId) && (open || closing)
  );
  const effectiveMood = mood ?? fetchedMood;
  const panelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );

  const dirty = Boolean(text.trim() || mediaFile);
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
    dirty: dirty && !recoveryCode,
    pending,
    onClose: finishClose,
  });

  const requestClose = useCallback(() => {
    if (!requestCloseOrConfirm()) return;
    finishClose();
  }, [finishClose, requestCloseOrConfirm]);

  const handleSheetClosed = useCallback(() => {
    clearDiscardConfirm();
    setClosing(false);
    onClose();
  }, [clearDiscardConfirm, onClose]);

  useEffect(() => {
    if (!open) {
      setText('');
      setMediaFile(null);
      setPreviewUrl(null);
      setError(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    if (!mediaFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  const clearMedia = useCallback(() => {
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const sheetOpen = open && !closing;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isConnected || !accountId) {
      await connect();
      return;
    }
    if (isBlockEitherWay(peerAccountId)) {
      setError('Messaging is unavailable while a block is in place.');
      return;
    }
    if (!hasSocialSession) {
      setError('Connect your session to send private messages.');
      return;
    }

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
      onSent?.();
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
        setPendingThreadId(result.threadId);
        return;
      }
      finishClose();
      router.push(messagesPath({ threadId: result.threadId }));
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not send message.'
      );
    } finally {
      setPending(false);
    }
  };

  const canSend = Boolean(text.trim() || mediaFile);

  return (
    <>
      <OsGestureSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        verb="Message"
        personName={name}
        handle={handle}
        signal="endorse"
        whisper="Private · only they can read"
        closeAriaLabel="Close message"
        backdropLabel="Close message"
        moodId={effectiveMood?.id}
        panelStyle={panelStyle}
        size="tall"
        bodyClassName="profile-support-sheet-body"
        titleId={titleId}
        footer={
          discardConfirmOpen ? (
            <DiscardConfirmFooter
              titleId={discardTitleId}
              bodyId={discardBodyId}
              onDiscard={discard}
              onKeepEditing={keepEditing}
              keepEditingRef={keepEditingRef}
              title="Discard message?"
              body="Your draft won’t be sent."
            />
          ) : undefined
        }
      >
        <form
          className={`dm-compose-form${
            discardConfirmOpen ? ' is-discard-confirm' : ''
          }`}
          onSubmit={(e) => void handleSubmit(e)}
        >
          <OsField label="Message" htmlFor="dm-compose-text">
            <textarea
              id="dm-compose-text"
              className={osFieldBorderedClassName}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write something private…"
              rows={5}
              disabled={pending || discardConfirmOpen}
            />
          </OsField>

          <div className="dm-compose-media">
            <input
              ref={fileInputRef}
              id={mediaInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              className="sr-only"
              disabled={pending || discardConfirmOpen}
              onChange={(event) =>
                setMediaFile(event.target.files?.[0] ?? null)
              }
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
                  <img
                    src={previewUrl}
                    alt=""
                    className="dm-compose-media-el"
                  />
                )}
                <button
                  type="button"
                  className="dm-compose-media-remove"
                  disabled={pending || discardConfirmOpen}
                  onClick={clearMedia}
                >
                  Remove media
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dm-compose-media-attach"
                disabled={pending || discardConfirmOpen}
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

          {!discardConfirmOpen ? (
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="submit"
                ready={canSend && !pending}
                pending={pending}
                pendingLabel="Sending…"
              >
                {!isConnected ? 'Connect wallet' : 'Send'}
              </OsSheetAction>
            </OsSheetActions>
          ) : null}
        </form>
      </OsGestureSheet>

      <DmRecoveryCodeSheet
        open={Boolean(recoveryCode)}
        code={recoveryCode ?? ''}
        onClose={() => {
          const threadId = pendingThreadId;
          setRecoveryCode(null);
          setPendingThreadId(null);
          onClose();
          router.push(messagesPath({ threadId: threadId || null }));
        }}
      />
    </>
  );
}
