'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DmMessageRecord, DmThreadSummary, OnSocial } from '@onsocial/sdk';
import {
  ArrowLeftIcon,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  ProfileAvatar,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { APP_HOME_PATH, messagesPath } from '@/lib/app-routes';
import { decryptDmMessage, isDmDecryptFailureText } from '@/lib/dm/send';
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
} from '@/lib/dm/keys';
import {
  lookupDmKeyBackup,
  lookupDmPublicKey,
  reconcileAndPublishDmIdentity,
} from '@/lib/dm/pubkey';
import {
  archiveSealedDmThreads,
  isDmThreadSealedArchived,
  recordDmKeysReset,
  reconcileDmThreadArchiveAfterDecrypt,
} from '@/lib/dm/thread-archive';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import { DmMediaBubble } from '@/features/messages/dm-media-bubble';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';
import {
  formatAbsoluteDmTime,
  formatRelativeDmTime,
} from '@/features/messages/dm-time';
import { DmThreadComposer } from '@/features/messages/dm-thread-composer';
import { DmUnlockPanel } from '@/features/messages/dm-unlock-panel';
import { resolveMessagesScreenChrome } from '@/features/messages/messages-screen-chrome';
import { useMessagesNarrow } from '@/features/messages/use-messages-narrow';
import { requestDmUnreadRefresh } from '@/components/providers/dm-unread-host';

const THREAD_POLL_MS = 12_000;
const THREAD_PAGE_SIZE = 50;

function threadTimeTrailing(iso: string, unread = false) {
  const relative = formatRelativeDmTime(iso);
  const absolute = formatAbsoluteDmTime(iso);
  if (!relative && !unread) return 'none' as const;
  return (
    <span className="messages-thread-meta">
      {unread ? <span className="os-surface-row-badge">New</span> : null}
      {relative ? (
        <time dateTime={iso} title={absolute || undefined}>
          {relative}
        </time>
      ) : null}
    </span>
  );
}

export function MessagesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerParam = searchParams.get('peer')?.trim().toLowerCase() ?? '';
  const threadParam = searchParams.get('thread')?.trim() ?? '';
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const narrow = useMessagesNarrow();

  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [messages, setMessages] = useState<DmMessageRecord[] | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [plainById, setPlainById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryVariant, setRecoveryVariant] = useState<'created' | 'reset'>(
    'created'
  );
  const [enrollPending, setEnrollPending] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(threadParam);
  const [keysTick, setKeysTick] = useState(0);
  const [archiveTick, setArchiveTick] = useState(0);
  const [showSealedArchive, setShowSealedArchive] = useState(false);
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

  const isCurrentAccount = useCallback(
    (expected: string | null | undefined) => {
      if (!expected) return false;
      const current = accountIdRef.current;
      return Boolean(
        current && current.toLowerCase() === expected.toLowerCase()
      );
    },
    []
  );

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

  const composePeer = peerParam;
  /** Sheet only for starting a DM from `?peer=` (profile still uses its own sheet). */
  const showCompose = Boolean(peerParam);

  const peerIds = useMemo(
    () => (threads ?? []).map((t) => t.peerAccountId),
    [threads]
  );
  const profiles = usePostAuthorProfiles(peerIds);

  const { inboxThreads, sealedThreads } = useMemo(() => {
    if (!threads || !accountId) {
      return { inboxThreads: threads, sealedThreads: [] as DmThreadSummary[] };
    }
    // archiveTick forces re-read of local archive after reset / decrypt.
    void archiveTick;
    const sealed: DmThreadSummary[] = [];
    const inbox: DmThreadSummary[] = [];
    for (const thread of threads) {
      if (isDmThreadSealedArchived(accountId, thread.threadId)) {
        sealed.push(thread);
      } else {
        inbox.push(thread);
      }
    }
    return { inboxThreads: inbox, sealedThreads: sealed };
  }, [accountId, archiveTick, threads]);

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
    if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
      return;
    }
    const remote = await lookupDmKeyBackup(client, accountId);
    if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
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
      if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
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
      if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
        return;
      }
      const pending = keys.recoveryCode ?? peekPendingDmRecoveryCode(accountId);
      if (pending) {
        setRecoveryVariant(keys.fromPendingRotation ? 'reset' : 'created');
        setRecoveryCode(pending);
      }
      setKeysTick((n) => n + 1);
    } catch (cause) {
      if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
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
    setHasMoreMessages(false);
    setPlainById({});
    setActiveThreadId('');
    setError(null);
    setRecoveryCode(null);
    setRecoveryVariant('created');
  }, []);

  useEffect(() => {
    clearThreadState();
  }, [accountId, clearThreadState]);

  const refreshThreads = useCallback(async () => {
    if (!accountId) return;
    const gen = accountGenRef.current;
    const expectedAccount = accountId;
    const { client } = await withAuth();
    if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
      return;
    }
    const { threads: next } = await client.dm.listThreads();
    if (accountGenRef.current !== gen || !isCurrentAccount(expectedAccount)) {
      return;
    }
    setThreads(next);
  }, [accountId, isCurrentAccount, withAuth]);

  const markThreadReadThrough = useCallback(
    async (
      client: Awaited<ReturnType<typeof withAuth>>['client'],
      threadId: string,
      msgs: DmMessageRecord[],
      plain: Record<string, string>
    ) => {
      let lastReadable: DmMessageRecord | undefined;
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const msg = msgs[i]!;
        if (!isDmDecryptFailureText(plain[msg.id])) {
          lastReadable = msg;
          break;
        }
      }
      if (!lastReadable) return;
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      await client.dm.markRead(threadId, {
        lastReadMessageId: lastReadable.id,
      });
    },
    []
  );

  const decryptMessages = useCallback(
    async (
      client: OnSocial,
      next: DmMessageRecord[],
      threadId: string
    ): Promise<Record<string, string>> => {
      if (activeThreadIdRef.current !== threadId) return {};
      if (!accountId || !hasUnlockedDmKey(accountId)) {
        setPlainById({});
        return {};
      }
      const expectedAccount = accountId;
      const plain: Record<string, string> = {};
      const senderKeyCache = new Map<
        string,
        Awaited<ReturnType<typeof lookupDmPublicKey>>
      >();
      for (const msg of next) {
        try {
          const senderId = msg.senderAccountId.trim().toLowerCase();
          const viewerIsSender = senderId === accountId.trim().toLowerCase();
          let expectedSenderPublicKey: Uint8Array | null | undefined;
          if (!viewerIsSender) {
            let lookup = senderKeyCache.get(senderId);
            if (!lookup) {
              lookup = await lookupDmPublicKey(client, senderId);
              senderKeyCache.set(senderId, lookup);
            }
            if (lookup.status === 'unavailable') {
              throw new Error('Could not verify sender messaging key.');
            }
            if (lookup.status === 'absent') {
              throw new Error('Sender has no published messaging key.');
            }
            expectedSenderPublicKey = lookup.value;
          }
          plain[msg.id] = await decryptDmMessage({
            client,
            accountId,
            ciphertext: msg.ciphertext,
            nonce: msg.nonce,
            senderPubkey: msg.senderPubkey,
            senderAccountId: msg.senderAccountId,
            senderCiphertext: msg.senderCiphertext,
            senderNonce: msg.senderNonce,
            ephemeralPubkey: msg.ephemeralPubkey,
            authTag: msg.authTag,
            mediaCids: msg.media?.map((item) => item.cid) ?? null,
            expectedSenderPublicKey,
          });
        } catch {
          plain[msg.id] = 'Unable to decrypt on this device.';
        }
      }
      if (activeThreadIdRef.current !== threadId) return plain;
      if (!isCurrentAccount(expectedAccount)) return plain;
      setPlainById((prev) => ({ ...prev, ...plain }));
      const archiveChange = reconcileDmThreadArchiveAfterDecrypt({
        accountId: expectedAccount,
        threadId,
        messageIds: next.map((msg) => msg.id),
        plainById: plain,
        isDecryptFailure: isDmDecryptFailureText,
      });
      if (archiveChange !== 'unchanged') {
        setArchiveTick((n) => n + 1);
      }
      return plain;
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
      const { messages: next, hasMore } = await client.dm.listMessages(
        threadId,
        { limit: THREAD_PAGE_SIZE }
      );
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      setMessages(next);
      setHasMoreMessages(hasMore);
      setPlainById({});
      const unlocked = Boolean(accountId && hasUnlockedDmKey(accountId));
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      const plain = await decryptMessages(client, next, threadId);
      if (
        openThreadSeqRef.current !== seq ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(expectedAccount)
      ) {
        return;
      }
      if (unlocked) {
        await markThreadReadThrough(client, threadId, next, plain);
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
        const { messages: next, hasMore } = await client.dm.listMessages(
          threadId,
          { limit: THREAD_PAGE_SIZE }
        );
        if (
          activeThreadIdRef.current !== threadId ||
          accountGenRef.current !== gen ||
          !isCurrentAccount(expectedAccount)
        ) {
          return;
        }
        const prev = messagesRef.current;
        const byId = new Map<string, DmMessageRecord>();
        for (const msg of prev ?? []) byId.set(msg.id, msg);
        for (const msg of next) byId.set(msg.id, msg);
        const merged = [...byId.values()].sort((a, b) => {
          const byTime = a.createdAt.localeCompare(b.createdAt);
          return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
        });
        const grew =
          !prev ||
          merged.length > prev.length ||
          merged.at(-1)?.id !== prev.at(-1)?.id;
        setMessages(merged);
        // hasMore from newest-page fetch only applies when we have no older pages.
        if (!prev || prev.length <= THREAD_PAGE_SIZE) {
          setHasMoreMessages(hasMore);
        }
        const plain = await decryptMessages(client, merged, threadId);
        if (
          grew &&
          accountId &&
          hasUnlockedDmKey(accountId) &&
          activeThreadIdRef.current === threadId &&
          accountGenRef.current === gen &&
          isCurrentAccount(expectedAccount)
        ) {
          await markThreadReadThrough(client, threadId, merged, plain);
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

  const handleUnlocked = useCallback(async () => {
    setError(null);
    setKeysTick((n) => n + 1);
    await bootstrapKeys();
    if (activeThreadId) await openThread(activeThreadId);
    else await refreshThreads();
  }, [activeThreadId, bootstrapKeys, openThread, refreshThreads]);

  /** Mobile: leave the full-thread pane and return to the conversation list. */
  const closeThread = useCallback(() => {
    openThreadSeqRef.current += 1;
    setActiveThreadId('');
    setMessages(null);
    setHasMoreMessages(false);
    setPlainById({});
    setError(null);
    router.replace(messagesPath({ peer: peerParam || null }));
  }, [peerParam, router]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeThreadId || !accountId || loadingOlder) return;
    const oldest = messagesRef.current?.[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const gen = accountGenRef.current;
      const { client } = await withAuth();
      if (accountGenRef.current !== gen || !isCurrentAccount(accountId)) return;
      const { messages: older, hasMore } = await client.dm.listMessages(
        activeThreadId,
        { limit: THREAD_PAGE_SIZE, beforeMessageId: oldest.id }
      );
      if (
        activeThreadIdRef.current !== activeThreadId ||
        accountGenRef.current !== gen ||
        !isCurrentAccount(accountId)
      ) {
        return;
      }
      const prev = messagesRef.current ?? [];
      const byId = new Map<string, DmMessageRecord>();
      for (const msg of older) byId.set(msg.id, msg);
      for (const msg of prev) byId.set(msg.id, msg);
      const merged = [...byId.values()].sort((a, b) => {
        const byTime = a.createdAt.localeCompare(b.createdAt);
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      });
      setMessages(merged);
      setHasMoreMessages(hasMore);
      await decryptMessages(client, merged, activeThreadId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load older messages.'
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [accountId, activeThreadId, decryptMessages, isCurrentAccount, withAuth]);

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

  const threadOpen = Boolean(activeThreadId && isUnlocked);
  const mobilePane = threadOpen ? 'thread' : 'list';
  const peerProfile = peerFromThread ? profiles[peerFromThread] : undefined;
  const peerName = peerFromThread
    ? displayName(peerFromThread, peerProfile?.displayName)
    : '';
  const peerHandle = peerFromThread ? fallbackLabel(peerFromThread) : '';
  const chrome = resolveMessagesScreenChrome({
    narrow,
    threadOpen,
    peerName,
    peerHandle,
    peerAccountId: peerFromThread,
  });

  let body: ReactNode;
  if (!isConnected || !accountId) {
    body = (
      <>
        <p className="messages-panel-empty">
          Connect your wallet to send private messages.
        </p>
        <OsSheetActions>
          <OsSheetAction type="button" ready onClick={() => void connect()}>
            Connect
          </OsSheetAction>
        </OsSheetActions>
      </>
    );
  } else if (!hasSocialSession) {
    body = (
      <p className="messages-panel-empty">
        Connect your session to load private messages.
      </p>
    );
  } else {
    const composer =
      peerFromThread && isUnlocked && activeThreadId ? (
        <DmThreadComposer
          peerAccountId={peerFromThread}
          onSent={() => {
            void refreshThreads();
            if (activeThreadId) void openThread(activeThreadId);
          }}
          onRecoveryCode={(code) => {
            setRecoveryVariant('created');
            setRecoveryCode(code);
          }}
        />
      ) : null;

    const unlockPanel =
      !isUnlocked && accountId ? (
        <DmUnlockPanel
          accountId={accountId}
          onUnlocked={() => void handleUnlocked()}
          onReset={(code) => {
            if (accountId) {
              recordDmKeysReset(accountId);
              archiveSealedDmThreads(
                accountId,
                (threads ?? []).map((thread) => thread.threadId)
              );
              setArchiveTick((n) => n + 1);
              setShowSealedArchive(false);
            }
            setPlainById({});
            setRecoveryVariant('reset');
            setRecoveryCode(code);
            void handleUnlocked();
          }}
        />
      ) : null;

    body = (
      <>
        {unlockPanel}

        {isUnlocked && canPasskey && !passkeyEnrolled ? (
          <button
            type="button"
            className="messages-passkey-hint"
            disabled={enrollPending}
            onClick={() => void handleEnrollPasskey()}
          >
            {enrollPending
              ? 'Enabling device unlock…'
              : 'Unlock next time with this device'}
          </button>
        ) : null}

        {error ? (
          <p className="messages-panel-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="messages-layout" data-mobile-pane={mobilePane}>
          <aside className="messages-thread-list" aria-label="Conversations">
            {threads == null ? (
              <p className="messages-panel-empty">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="messages-panel-empty">
                No conversations yet. Message someone from their profile.
              </p>
            ) : inboxThreads &&
              inboxThreads.length === 0 &&
              sealedThreads.length > 0 ? (
              <p className="messages-panel-empty">
                No open conversations. Sealed threads from before a key reset
                are below.
              </p>
            ) : inboxThreads && inboxThreads.length === 0 ? (
              <p className="messages-panel-empty">
                No conversations yet. Message someone from their profile.
              </p>
            ) : (
              <OsSurfaceRowList as="div" aria-label="Conversations">
                {(inboxThreads ?? []).map((thread) => {
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
                      trailing={threadTimeTrailing(
                        thread.lastMessageAt,
                        thread.unread
                      )}
                      onClick={() => void openThread(thread.threadId)}
                    />
                  );
                })}
              </OsSurfaceRowList>
            )}
            {sealedThreads.length > 0 ? (
              <div className="messages-sealed-archive">
                <button
                  type="button"
                  className="messages-sealed-archive-toggle"
                  aria-expanded={showSealedArchive}
                  onClick={() => setShowSealedArchive((open) => !open)}
                >
                  {showSealedArchive ? 'Hide sealed' : 'Sealed before reset'} ·{' '}
                  {sealedThreads.length}
                </button>
                {showSealedArchive ? (
                  <OsSurfaceRowList as="div" aria-label="Sealed conversations">
                    {sealedThreads.map((thread) => {
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
                          description={
                            name !== handle
                              ? `@${handle} · sealed`
                              : 'Sealed before reset'
                          }
                          leading={
                            <ProfileAvatar
                              src={profile?.avatarUrl ?? undefined}
                              fallbackInitial={name.slice(0, 1)}
                              size="sm"
                            />
                          }
                          trailing={threadTimeTrailing(thread.lastMessageAt)}
                          onClick={() => void openThread(thread.threadId)}
                        />
                      );
                    })}
                  </OsSurfaceRowList>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="messages-thread" aria-label="Thread">
            {!narrow && activeThreadId && peerFromThread ? (
              <header className="messages-thread-peer">
                <ProfileAvatar
                  src={peerProfile?.avatarUrl ?? undefined}
                  fallbackInitial={(peerName || '?').slice(0, 1)}
                  size="sm"
                />
                <div className="messages-thread-peer-copy">
                  <Link
                    href={`/${peerFromThread}`}
                    className="messages-thread-peer-name"
                    scroll={false}
                  >
                    {peerName || 'Conversation'}
                  </Link>
                  {peerHandle && peerName !== peerHandle ? (
                    <p className="messages-thread-peer-handle">@{peerHandle}</p>
                  ) : (
                    <p className="messages-thread-peer-handle">{peerHandle}</p>
                  )}
                </div>
              </header>
            ) : null}
            <div className="messages-thread-scroll">
              {!activeThreadId ? (
                <p className="messages-panel-empty messages-thread-empty">
                  Pick a conversation, or message someone from their profile.
                </p>
              ) : !isUnlocked ? (
                <p className="messages-panel-empty">
                  Unlock messages to read this conversation.
                </p>
              ) : messages == null ? (
                <p className="messages-panel-empty">Loading…</p>
              ) : (
                <>
                  {accountId &&
                  activeThreadId &&
                  isDmThreadSealedArchived(accountId, activeThreadId) ? (
                    <p className="messages-sealed-banner" role="status">
                      Sealed before a key reset. New replies open normally.
                    </p>
                  ) : null}
                  {hasMoreMessages ? (
                    <div className="messages-load-older">
                      <OsSheetAction
                        type="button"
                        ready={!loadingOlder}
                        pending={loadingOlder}
                        pendingLabel="Loading…"
                        onClick={() => void loadOlderMessages()}
                      >
                        Earlier
                      </OsSheetAction>
                    </div>
                  ) : null}
                  <ul className="messages-bubble-list">
                    {messages.map((msg) => {
                      const mine =
                        msg.senderAccountId === accountId.toLowerCase();
                      const text = plainById[msg.id];
                      const relative = formatRelativeDmTime(msg.createdAt);
                      const absolute = formatAbsoluteDmTime(msg.createdAt);
                      return (
                        <li
                          key={msg.id}
                          className={
                            mine ? 'messages-bubble is-mine' : 'messages-bubble'
                          }
                        >
                          {text != null ? (
                            text ? (
                              <p>{text}</p>
                            ) : null
                          ) : (
                            <p>…</p>
                          )}
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
                          {relative ? (
                            <time
                              dateTime={msg.createdAt}
                              title={absolute || undefined}
                            >
                              {relative}
                            </time>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
            {composer ? (
              <div className="messages-thread-footer">{composer}</div>
            ) : null}
          </section>
        </div>

        <DmComposeSheet
          open={showCompose && Boolean(composePeer)}
          peerAccountId={composePeer}
          onClose={() => {
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
          accountId={accountId}
          variant={recoveryVariant}
          onClose={() => {
            // Passive dismiss keeps pendingRecoveryCode so the sheet can reappear.
            setRecoveryCode(null);
          }}
          onAcknowledge={() => {
            if (accountId) acknowledgeDmRecoveryCode(accountId);
            setRecoveryCode(null);
            setRecoveryVariant('created');
          }}
          onPasskeyEnrolled={() => setKeysTick((n) => n + 1)}
        />
      </>
    );
  }

  return (
    <OsAppScreen
      title={chrome.title}
      subtitle={chrome.subtitle}
      titleHref={chrome.titleHref}
      backFallbackHref={APP_HOME_PATH}
      glassChrome
      leading={
        chrome.closeThread ? (
          <OsIconAction ariaLabel="Back to conversations" onClick={closeThread}>
            <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </OsIconAction>
        ) : undefined
      }
    >
      <div className="messages-panel" data-mobile-pane={mobilePane}>
        {body}
      </div>
    </OsAppScreen>
  );
}
