'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DmMessageRecord, DmThreadSummary } from '@onsocial/sdk';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { messagesPath } from '@/lib/app-routes';
import { decryptDmMessage } from '@/lib/dm/send';
import {
  ensureDmKeys,
  hasUnlockedDmKey,
  restoreDmKeysFromRecoveryCode,
} from '@/lib/dm/keys';
import { fetchDmKeyBackup, publishDmKeyBackup } from '@/lib/dm/pubkey';
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
  const [activeThreadId, setActiveThreadId] = useState(threadParam);

  const unlocked = accountId ? hasUnlockedDmKey(accountId) : false;

  const peerFromThread = useMemo(() => {
    if (!activeThreadId || !accountId) return peerParam;
    const parts = activeThreadId.split('::');
    return parts.find((p) => p !== accountId.toLowerCase()) ?? peerParam;
  }, [activeThreadId, accountId, peerParam]);

  const composePeer = peerParam || peerFromThread;
  const showCompose = composeOpen || Boolean(peerParam);

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
    const keys = await ensureDmKeys(accountId);
    if (keys.created && keys.backup) {
      await publishDmKeyBackup(client, keys.backup);
    } else if (keys.backup) {
      const remote = await fetchDmKeyBackup(client, accountId);
      if (!remote) {
        await publishDmKeyBackup(client, keys.backup);
      }
    }
    if (keys.recoveryCode) setRecoveryCode(keys.recoveryCode);
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
      if (!accountId) return;
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
      if (activeThreadId) await openThread(activeThreadId);
      else await refreshThreads();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not restore keys.'
      );
    }
  };

  if (!isConnected || !accountId) {
    return (
      <div className="messages-panel">
        <header className="messages-panel-header">
          <h1>Messages</h1>
        </header>
        <p className="messages-panel-empty">
          Connect your wallet to send private messages.
        </p>
        <button type="button" className="os-sheet-action" onClick={() => void connect()}>
          Connect
        </button>
      </div>
    );
  }

  return (
    <div className="messages-panel">
      <header className="messages-panel-header">
        <h1>Messages</h1>
        <p>Private · encrypted on your device</p>
      </header>

      {!unlocked ? (
        <section className="messages-unlock" aria-label="Unlock messages">
          <p>
            Enter your recovery code to unlock private messages on this device.
          </p>
          <input
            className="os-field-bordered"
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
          />
          <button type="button" onClick={() => void handleRestore()}>
            Unlock
          </button>
        </section>
      ) : null}

      {error ? <p className="messages-panel-error">{error}</p> : null}

      <div className="messages-layout">
        <aside className="messages-thread-list" aria-label="Conversations">
          {threads == null ? (
            <p>Loading…</p>
          ) : threads.length === 0 ? (
            <p className="messages-panel-empty">No conversations yet.</p>
          ) : (
            <ul>
              {threads.map((thread) => (
                <li key={thread.threadId}>
                  <button
                    type="button"
                    className={
                      thread.threadId === activeThreadId
                        ? 'messages-thread-row is-active'
                        : 'messages-thread-row'
                    }
                    onClick={() => void openThread(thread.threadId)}
                  >
                    <span>{thread.peerAccountId}</span>
                    {thread.unread ? <span className="messages-unread">New</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="messages-thread" aria-label="Thread">
          {!activeThreadId ? (
            <p className="messages-panel-empty">
              Pick a conversation or message someone from their profile.
            </p>
          ) : messages == null ? (
            <p>Loading…</p>
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
                    {unlocked && msg.media?.length
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
          {peerFromThread ? (
            <div className="messages-thread-actions">
              <button type="button" onClick={() => setComposeOpen(true)}>
                Reply
              </button>
              <Link href={`/${peerFromThread}`}>View profile</Link>
            </div>
          ) : null}
        </section>
      </div>

      <DmComposeSheet
        open={showCompose && Boolean(composePeer)}
        peerAccountId={composePeer}
        onClose={() => {
          setComposeOpen(false);
          if (peerParam) {
            router.replace(
              messagesPath({ threadId: activeThreadId || null })
            );
          }
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
