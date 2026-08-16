'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  DmKeysMismatchError,
  DmKeysUnavailableError,
  acknowledgeDmRecoveryCode,
  canOfferDmPasskey,
  enrollDmPasskeyUnlock,
  ensureDmKeys,
  hasDmPasskeyEnrolled,
  hasUnlockedDmKey,
  peekPendingDmRecoveryCode,
  restoreDmKeysFromRecoveryCode,
  unlockDmKeysWithPasskey,
} from '@/lib/dm/keys';
import {
  lookupDmKeyBackup,
  reconcileAndPublishDmIdentity,
} from '@/lib/dm/pubkey';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import { DmMediaBubble } from '@/features/messages/dm-media-bubble';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';
import { requestDmUnreadRefresh } from '@/components/providers/dm-unread-host';

const THREAD_POLL_MS = 12_000;

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
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [enrollPending, setEnrollPending] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(threadParam);
  const [keysTick, setKeysTick] = useState(0);
  const activeThreadIdRef = useRef(activeThreadId);
  const messagesRef = useRef(messages);
  const openThreadSeqRef = useRef(0);
  /** Bumps on account change so late async commits cannot leak across wallets. */
  const accountGenRef = useRef(0);
  const accountIdRef = useRef(accountId);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    accountIdRef.current = accountId;
    accountGenRef.current += 1;
  }, [accountId]);

  const isCurrentAccount = useCallback((expected: string | null | undefined) => {
    if (!expected) return false;
    const current = accountIdRef.current;
    return Boolean(
      current && current.toLowerCase() === expected.toLowerCase()
    );
  }, []);

  // keysTick forces a re-read of localStorage after unlock / bootstrap.
  const isUnlocked = Boolean(
    accountId && keysTick >= 0 && hasUnlockedDmKey(accountId)
  );
  const passkeyEnrolled = Boolean(
    accountId && keysTick >= 0 && hasDmPasskeyEnrolled(accountId)
  );
  const canPasskey = canOfferDmPasskey();

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
    const gen = accountGenRef.current;
    const expectedAccount = accountId;
    const { client } = await getClient();
    if (
      accountGenRef.current !== gen ||
      !isCurrentAccount(expectedAccount)
    ) {
      return;
    }
    const remote = await lookupDmKeyBackup(client, accountId);
    if (
      accountGenRef.current !== gen ||
      !isCurrentAccount(expectedAccount)
    ) {
      return;
    }
    if (remote.status === 'unavailable') {
      setError(
        'Could not verify messaging keys. Check your connection and try again.'
      );
      setKeysTick((n) => n + 1);
      return;
    }
    try {
      const keys = await ensureDmKeys(accountId, { remote });
      if (
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      if (keys.backup) {
        await reconcileAndPublishDmIdentity({
          client,
          accountId,
          publicKeyEncoded: keys.publicKeyEncoded,
          backup: keys.backup,
          created: keys.created,
        });
      }
      if (
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      const pending = keys.recoveryCode ?? peekPendingDmRecoveryCode(accountId);
      if (pending) setRecoveryCode(pending);
      setKeysTick((n) => n + 1);
    } catch (cause) {
      if (
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      if (
        cause instanceof DmKeysLockedError ||
        cause instanceof DmKeysMismatchError
      ) {
        setError(cause.message);
        setKeysTick((n) => n + 1);
        return;
      }
      if (cause instanceof DmKeysUnavailableError) {
        setError(cause.message);
        setKeysTick((n) => n + 1);
        return;
      }
      throw cause;
    }
  }, [accountId, getClient, hasSocialSession, isCurrentAccount]);

  const clearThreadState = useCallback(() => {
    openThreadSeqRef.current += 1;
    setThreads(null);
    setMessages(null);
    setPlainById({});
    setActiveThreadId('');
    setError(null);
    setRecoveryInput('');
    setRecoveryCode(null);
    setComposeOpen(false);
  }, []);

  useEffect(() => {
    clearThreadState();
  }, [accountId, clearThreadState]);

  const refreshThreads = useCallback(async () => {
    if (!accountId) return;
    const gen = accountGenRef.current;
    const expectedAccount = accountId;
    const { client } = await withAuth();
    if (
      accountGenRef.current !== gen ||
      !isCurrentAccount(expectedAccount)
    ) {
      return;
    }
    const { threads: next } = await client.dm.listThreads();
    if (
      accountGenRef.current !== gen ||
      !isCurrentAccount(expectedAccount)
    ) {
      return;
    }
    setThreads(next);
  }, [accountId, isCurrentAccount, withAuth]);

  const markThreadReadThrough = useCallback(
    async (
      client: Awaited<ReturnType<typeof withAuth>>['client'],
      threadId: string,
      msgs: DmMessageRecord[]
    ) => {
      const last = msgs.at(-1);
      if (!last) return;
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      await client.dm.markRead(threadId, {
        lastReadMessageId: last.id,
      });
    },
    []
  );

  const decryptMessages = useCallback(
    async (next: DmMessageRecord[], threadId: string) => {
      if (activeThreadIdRef.current !== threadId) return;
      if (!accountId || !hasUnlockedDmKey(accountId)) {
        setPlainById({});
        return;
      }
      const expectedAccount = accountId;
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
            ephemeralPubkey: msg.ephemeralPubkey,
            authTag: msg.authTag,
          });
        } catch {
          plain[msg.id] = 'Unable to decrypt on this device.';
        }
      }
      if (activeThreadIdRef.current !== threadId) return;
      if (!isCurrentAccount(expectedAccount)) return;
      setPlainById(plain);
    },
    [accountId, isCurrentAccount]
  );

  const openThread = useCallback(
    async (threadId: string) => {
      const seq = ++openThreadSeqRef.current;
      const gen = accountGenRef.current;
      const expectedAccount = accountId;
      setActiveThreadId(threadId);
      setError(null);
      router.replace(messagesPath({ threadId }));
      const { client } = await withAuth();
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      const { messages: next } = await client.dm.listMessages(threadId);
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      setMessages(next);
      const unlocked = Boolean(accountId && hasUnlockedDmKey(accountId));
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      await decryptMessages(next, threadId);
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      if (unlocked) {
        await markThreadReadThrough(client, threadId, next);
        requestDmUnreadRefresh();
      }
      void refreshThreads();
    },
    [
      accountId,
      decryptMessages,
      isCurrentAccount,
      markThreadReadThrough,
      refreshThreads,
      router,
      withAuth,
    ]
  );

  const softRefreshOpenThread = useCallback(
    async (threadId: string) => {
      try {
        const gen = accountGenRef.current;
        const expectedAccount = accountId;
        const { client } = await withAuth();
        if (
          accountGenRef.current !== gen ||
          !isCurrentAccount(expectedAccount)
        ) {
          return;
        }
        const { messages: next } = await client.dm.listMessages(threadId);
        if (
          activeThreadIdRef.current !== threadId ||
          accountGenRef.current !== gen ||
          !isCurrentAccount(expectedAccount)
        ) {
          return;
        }
        const prev = messagesRef.current;
        const grew =
          !prev ||
          next.length > prev.length ||
          next.at(-1)?.id !== prev.at(-1)?.id;
        setMessages(next);
        await decryptMessages(next, threadId);
        if (
          grew &&
          accountId &&
          hasUnlockedDmKey(accountId) &&
          activeThreadIdRef.current === threadId &&
          accountGenRef.current === gen &&
          isCurrentAccount(expectedAccount)
        ) {
          await markThreadReadThrough(client, threadId, next);
          requestDmUnreadRefresh();
          void refreshThreads();
        }
      } catch {
        // Soft poll — ignore transient errors.
      }
    },
    [
      accountId,
      decryptMessages,
      isCurrentAccount,
      markThreadReadThrough,
      refreshThreads,
      withAuth,
    ]
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

  // Soft refresh while the inbox is open so new sealed DMs appear without reload.
  useEffect(() => {
    if (!isConnected || !accountId || !hasSocialSession) return;
    const tick = () => {
      void refreshThreads();
      requestDmUnreadRefresh();
      if (activeThreadId && isUnlocked) {
        void softRefreshOpenThread(activeThreadId);
      }
    };
    const id = window.setInterval(tick, THREAD_POLL_MS);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    accountId,
    activeThreadId,
    hasSocialSession,
    isConnected,
    isUnlocked,
    refreshThreads,
    softRefreshOpenThread,
  ]);

  const handleRestore = async () => {
    if (!accountId || !recoveryInput.trim()) return;
    setUnlockPending(true);
    try {
      const { client } = await getClient();
      const remote = await lookupDmKeyBackup(client, accountId);
      if (remote.status === 'unavailable') {
        setError(
          'Could not verify messaging keys. Check your connection and try again.'
        );
        return;
      }
      await restoreDmKeysFromRecoveryCode({
        accountId,
        recoveryCode: recoveryInput.trim(),
        remoteBackup: remote.status === 'found' ? remote.value : null,
        preferRemote: remote.status === 'found',
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

  const handlePasskeyUnlock = async () => {
    if (!accountId) return;
    setPasskeyPending(true);
    setError(null);
    try {
      await unlockDmKeysWithPasskey(accountId);
      setKeysTick((n) => n + 1);
      if (activeThreadId) await openThread(activeThreadId);
      else await refreshThreads();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not unlock with passkey.'
      );
    } finally {
      setPasskeyPending(false);
    }
  };

  const handleEnrollPasskey = async () => {
    if (!accountId || !isUnlocked) return;
    setEnrollPending(true);
    setError(null);
    try {
      const result = await enrollDmPasskeyUnlock(accountId);
      if (!result.ok) {
        if (result.reason === 'cancelled') return;
        setError(
          result.reason === 'unsupported'
            ? 'Passkey unlock isn’t available on this device.'
            : 'Couldn’t enable passkey unlock.'
        );
        return;
      }
      setKeysTick((n) => n + 1);
    } finally {
      setEnrollPending(false);
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
            {passkeyEnrolled
              ? 'Unlock private messages on this device.'
              : 'Enter your recovery code to unlock private messages on this device.'}
          </p>
          {passkeyEnrolled ? (
            <OsSheetActions layout="stack">
              <OsSheetAction
                type="button"
                ready={!passkeyPending}
                pending={passkeyPending}
                pendingLabel="Unlocking…"
                onClick={() => void handlePasskeyUnlock()}
              >
                Unlock with this device
              </OsSheetAction>
            </OsSheetActions>
          ) : null}
          <OsField
            label={passkeyEnrolled ? 'Or recovery code' : 'Recovery code'}
            htmlFor="dm-unlock-code"
          >
            <input
              id="dm-unlock-code"
              className={osFieldBorderedClassName}
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              disabled={unlockPending || passkeyPending}
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
              Unlock with code
            </OsSheetAction>
          </OsSheetActions>
        </section>
      ) : isUnlocked && canPasskey && !passkeyEnrolled ? (
        <section className="messages-unlock" aria-label="Enable passkey unlock">
          <p>
            Optional: unlock next time with this device instead of your code.
          </p>
          <OsSheetActions>
            <OsSheetAction
              type="button"
              ready={!enrollPending}
              pending={enrollPending}
              pendingLabel="Enabling…"
              onClick={() => void handleEnrollPasskey()}
            >
              Enable device unlock
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
                const mine = msg.senderAccountId === accountId.toLowerCase();
                const text = plainById[msg.id];
                return (
                  <li
                    key={msg.id}
                    className={
                      mine ? 'messages-bubble is-mine' : 'messages-bubble'
                    }
                  >
                    {text != null ? text ? <p>{text}</p> : null : <p>…</p>}
                    {msg.media?.length
                      ? msg.media.map((item) => (
                          <DmMediaBubble
                            key={`${msg.id}-${item.cid}`}
                            accountId={accountId}
                            senderAccountId={msg.senderAccountId}
                            senderPubkey={msg.senderPubkey}
                            ephemeralPubkey={msg.ephemeralPubkey}
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
            router.replace(messagesPath({ threadId: activeThreadId || null }));
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
        accountId={accountId}
        onClose={() => {
          // Passive dismiss keeps pendingRecoveryCode so the sheet can reappear.
          setRecoveryCode(null);
        }}
        onAcknowledge={() => {
          if (accountId) acknowledgeDmRecoveryCode(accountId);
          setRecoveryCode(null);
        }}
        onPasskeyEnrolled={() => setKeysTick((n) => n + 1)}
      />
    </div>
  );
}
