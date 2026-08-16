'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DmMessageRecord, DmThreadSummary } from '@onsocial/sdk';
import {
  OsField,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  ProfileAvatar,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { messagesPath } from '@/lib/app-routes';
import { decryptDmMessage } from '@/lib/dm/send';
import {
  DmKeysLockedError,
  ensureDmKeys,
  hasUnlockedDmKey,
  restoreDmKeysFromRecoveryCode,
} from '@/lib/dm/keys';
import { fetchDmKeyBackup, publishDmKeyBackup } from '@/lib/dm/pubkey';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import { DmMediaBubble } from '@/features/messages/dm-media-bubble';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';

export function MessagesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerParam = searchParams.get('peer')?.trim().toLowerCase() ?? '';
  const threadParam = searchParams.get('thread')?.trim() ?? '';
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();

  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [messages, setMessages] = useState<DmMessageRecord[] | null>(null);
  const [plainById, setPlainById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [unlockPending, setUnlockPending] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(threadParam);
  const [keysTick, setKeysTick] = useState(0);

  // keysTick forces a re-read of localStorage after unlock / bootstrap.
  const isUnlocked = Boolean(
    accountId && keysTick >= 0 && hasUnlockedDmKey(accountId)
  );

  const peerFromThread = useMemo(() => {
    if (!activeThreadId || !accountId) return peerParam;
    const parts = activeThreadId.split('::');
    return parts.find((p) => p !== accountId.toLowerCase()) ?? peerParam;
  }, [activeThreadId, accountId, peerParam]);

  const composePeer = peerParam || peerFromThread;
  const showCompose = composeOpen || Boolean(peerParam);

  const peerIds = useMemo(
    () => (threads ?? []).map((t) => t.peerAccountId),
    [threads]
  );
  const profiles = usePostAuthorProfiles(peerIds);

  const withAuth = useCallback(async () => {
    const { client, session, wallet, accountId: id } = await getClient();
    if (!session) throw new Error('Session required');
    let token = getCachedAppGatewayAuth(id);
    if (!token) {
      token = await ensureAppGatewayAuth({
        accountId: id,
        wallet,
        session,
        allowWalletFallback: true,
      });
    }
    client.auth.setToken(token);
    return { client, session, wallet, accountId: id };
  }, [getClient]);

  const bootstrapKeys = useCallback(async () => {
    if (!accountId || !hasSocialSession) return;
    const { client } = await getClient();
    const remoteBackup = await fetchDmKeyBackup(client, accountId);
    try {
      const keys = await ensureDmKeys(accountId, { remoteBackup });
      if (keys.created && keys.backup) {
        await publishDmKeyBackup(client, keys.backup);
      } else if (keys.backup) {
        const remote = await fetchDmKeyBackup(client, accountId);
        if (!remote) {
          await publishDmKeyBackup(client, keys.backup);
        }
      }
      if (keys.recoveryCode) setRecoveryCode(keys.recoveryCode);
      setKeysTick((n) => n + 1);
    } catch (cause) {
      if (cause instanceof DmKeysLockedError) {
        setKeysTick((n) => n + 1);
        return;
      }
      throw cause;
    }
  }, [accountId, getClient, hasSocialSession]);

  const refreshThreads = useCallback(async () => {
    if (!accountId) return;
    const { client } = await withAuth();
    const { threads: next } = await client.dm.listThreads();
    setThreads(next);
  }, [accountId, withAuth]);

  const openThread = useCallback(
    async (threadId: string) => {
      setActiveThreadId(threadId);
      setError(null);
      router.replace(messagesPath({ threadId }));
      const { client } = await withAuth();
      const { messages: next } = await client.dm.listMessages(threadId);
      setMessages(next);
      await client.dm.markRead(threadId);
      if (!accountId || !hasUnlockedDmKey(accountId)) {
        setPlainById({});
        void refreshThreads();
        return;
      }
      const plain: Record<string, string> = {};
      for (const msg of next) {
        try {
          plain[msg.id] = await decryptDmMessage({
            accountId,
            ciphertext: msg.ciphertext,
            nonce: msg.nonce,
            senderPubkey: msg.senderPubkey,
            senderAccountId: msg.senderAccountId,
            senderCiphertext: msg.senderCiphertext,
            senderNonce: msg.senderNonce,
          });
        } catch {
          plain[msg.id] = 'Unable to decrypt on this device.';
        }
      }
      setPlainById(plain);
      void refreshThreads();
    },
    [accountId, refreshThreads, router, withAuth]
  );

  useEffect(() => {
    if (!isConnected || !accountId || !hasSocialSession) return;
    void (async () => {
      try {
        await bootstrapKeys();
        await refreshThreads();
        if (threadParam) await openThread(threadParam);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not load messages.'
        );
      }
    })();
  }, [
    accountId,
    bootstrapKeys,
    hasSocialSession,
    isConnected,
    openThread,
    refreshThreads,
    threadParam,
  ]);

  const handleRestore = async () => {
    if (!accountId || !recoveryInput.trim()) return;
    setUnlockPending(true);
    try {
      const { client } = await getClient();
      const remoteBackup = await fetchDmKeyBackup(client, accountId);
      await restoreDmKeysFromRecoveryCode({
        accountId,
        recoveryCode: recoveryInput.trim(),
        remoteBackup,
      });
      setRecoveryInput('');
      setError(null);
      setKeysTick((n) => n + 1);
      if (activeThreadId) await openThread(activeThreadId);
      else await refreshThreads();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not restore keys.'
      );
    } finally {
      setUnlockPending(false);
    }
  };

  if (!isConnected || !accountId) {
    return (
      <div className="messages-panel">
        <header className="messages-panel-header">
          <h1>Messages</h1>
          <p>Private · encrypted on your device</p>
        </header>
        <p className="messages-panel-empty">
          Connect your wallet to send private messages.
        </p>
        <OsSheetActions>
          <OsSheetAction type="button" ready onClick={() => void connect()}>
            Connect
          </OsSheetAction>
        </OsSheetActions>
      </div>
    );
  }

  return (
    <div className="messages-panel">
      <header className="messages-panel-header">
        <h1>Messages</h1>
        <p>Private · encrypted on your device</p>
      </header>

      {!isUnlocked ? (
        <section className="messages-unlock" aria-label="Unlock messages">
          <p>
            Enter your recovery code to unlock private messages on this device.
          </p>
          <OsField label="Recovery code" htmlFor="dm-unlock-code">
            <input
              id="dm-unlock-code"
              className={osFieldBorderedClassName}
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              disabled={unlockPending}
            />
          </OsField>
          <OsSheetActions>
            <OsSheetAction
              type="button"
              ready={Boolean(recoveryInput.trim())}
              pending={unlockPending}
              pendingLabel="Unlocking…"
              onClick={() => void handleRestore()}
            >
              Unlock
            </OsSheetAction>
          </OsSheetActions>
        </section>
      ) : null}

      {error ? (
        <p className="messages-panel-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="messages-layout">
        <aside className="messages-thread-list" aria-label="Conversations">
          {threads == null ? (
            <p className="messages-panel-empty">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="messages-panel-empty">No conversations yet.</p>
          ) : (
            <OsSurfaceRowList as="div" aria-label="Conversations">
              {threads.map((thread) => {
                const profile = profiles[thread.peerAccountId];
                const name = displayName(
                  thread.peerAccountId,
                  profile?.displayName
                );
                const handle = fallbackLabel(thread.peerAccountId);
                return (
                  <OsSurfaceRow
                    key={thread.threadId}
                    active={thread.threadId === activeThreadId}
                    label={name}
                    description={name !== handle ? `@${handle}` : undefined}
                    leading={
                      <ProfileAvatar
                        src={profile?.avatarUrl ?? undefined}
                        fallbackInitial={name.slice(0, 1)}
                        size="sm"
                      />
                    }
                    badge={thread.unread ? 'New' : undefined}
                    trailing={thread.unread ? undefined : 'navigate'}
                    onClick={() => void openThread(thread.threadId)}
                  />
                );
              })}
            </OsSurfaceRowList>
          )}
        </aside>

        <section className="messages-thread" aria-label="Thread">
          {!activeThreadId ? (
            <p className="messages-panel-empty">
              Pick a conversation or message someone from their profile.
            </p>
          ) : !isUnlocked ? (
            <p className="messages-panel-empty">
              Unlock messages to read this conversation.
            </p>
          ) : messages == null ? (
            <p className="messages-panel-empty">Loading…</p>
          ) : (
            <ul className="messages-bubble-list">
              {messages.map((msg) => {
                const mine =
                  msg.senderAccountId === accountId.toLowerCase();
                const text = plainById[msg.id];
                return (
                  <li
                    key={msg.id}
                    className={
                      mine ? 'messages-bubble is-mine' : 'messages-bubble'
                    }
                  >
                    {text ? <p>{text}</p> : <p>…</p>}
                    {msg.media?.length
                      ? msg.media.map((item) => (
                          <DmMediaBubble
                            key={`${msg.id}-${item.cid}`}
                            accountId={accountId}
                            senderAccountId={msg.senderAccountId}
                            senderPubkey={msg.senderPubkey}
                            cid={item.cid}
                            mime={item.mime}
                            nonce={item.nonce}
                            senderNonce={item.senderNonce}
                          />
                        ))
                      : null}
                    <time dateTime={msg.createdAt}>
                      {new Date(msg.createdAt).toLocaleString()}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
          {peerFromThread && isUnlocked ? (
            <div className="messages-thread-actions">
              <OsSheetActions>
                <OsSheetAction
                  type="button"
                  ready
                  onClick={() => setComposeOpen(true)}
                >
                  Reply
                </OsSheetAction>
              </OsSheetActions>
              <Link
                className="messages-thread-profile-link"
                href={`/${peerFromThread}`}
              >
                View profile
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <DmComposeSheet
        open={showCompose && Boolean(composePeer) && isUnlocked}
        peerAccountId={composePeer}
        onClose={() => {
          setComposeOpen(false);
          if (peerParam) {
            router.replace(
              messagesPath({ threadId: activeThreadId || null })
            );
          }
        }}
        onSent={() => {
          void refreshThreads();
          if (activeThreadId) void openThread(activeThreadId);
        }}
      />
      <DmRecoveryCodeSheet
        open={Boolean(recoveryCode)}
        code={recoveryCode ?? ''}
        onClose={() => setRecoveryCode(null)}
      />
    </div>
  );
}
