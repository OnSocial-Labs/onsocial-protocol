'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OsField, OsGestureSheet, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { ensureDmKeys } from '@/lib/dm/keys';
import { sendEncryptedDm } from '@/lib/dm/send';
import { messagesPath } from '@/lib/app-routes';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';

interface DmComposeSheetProps {
  open: boolean;
  peerAccountId: string;
  peerName?: string | null;
  onClose: () => void;
}

export function DmComposeSheet({
  open,
  peerAccountId,
  peerName,
  onClose,
}: DmComposeSheetProps) {
  const router = useRouter();
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setText('');
      setMediaFile(null);
      setError(null);
      setPending(false);
    }
  }, [open]);

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
      // Warm keys before send so recovery sheet can show on first use.
      await ensureDmKeys(accountId);
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
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
        return;
      }
      onClose();
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

  return (
    <>
      <OsGestureSheet
        open={open}
        onClose={onClose}
        verb="Message"
        personName={peerName?.trim() || peerAccountId}
        handle={peerAccountId}
        signal="endorse"
        whisper="Private · only they can read"
        closeAriaLabel="Close message"
        size="tall"
      >
        <form className="dm-compose-form" onSubmit={(e) => void handleSubmit(e)}>
          <OsField label="Message" htmlFor="dm-compose-text">
            <textarea
              id="dm-compose-text"
              className="os-field-bordered"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write something private…"
              rows={5}
              disabled={pending}
            />
          </OsField>
          <label className="dm-compose-media">
            <span>Media (optional)</span>
            <input
              type="file"
              accept="image/*,video/*"
              disabled={pending}
              onChange={(event) =>
                setMediaFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          {error ? <p className="dm-compose-error">{error}</p> : null}
          <OsSheetActions>
            <OsSheetAction type="submit" pending={pending}>
              {pending ? 'Sending…' : 'Send'}
            </OsSheetAction>
          </OsSheetActions>
        </form>
      </OsGestureSheet>

      <DmRecoveryCodeSheet
        open={Boolean(recoveryCode)}
        code={recoveryCode ?? ''}
        onClose={() => {
          const code = recoveryCode;
          setRecoveryCode(null);
          onClose();
          if (code) {
            router.push(messagesPath());
          }
        }}
      />
    </>
  );
}
