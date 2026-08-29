'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DmMessageRecord, DmThreadSummary, OnSocial } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
  OsIconAction,
  PulsingDots,
  QuestionMarkCircleFillIcon,
  OsAppChromePage,
  OsAppChromePageStatus,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { ContextualBack } from '@/components/app/contextual-back';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { APP_HOME_PATH, messagesPath } from '@/lib/app-routes';
import { DM_PEER_MESSAGES_UNAVAILABLE } from '@/lib/dm/copy';
import {
  decryptDmMessage,
  isDmDecryptFailureText,
  sendEncryptedDm,
} from '@/lib/dm/send';
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
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { DmMediaBubble } from '@/features/messages/dm-media-bubble';
import { DmRecoveryCodeSheet } from '@/features/messages/dm-recovery-code-sheet';
import { inboxPreviewFromDecrypted } from '@/features/messages/dm-inbox-preview';
import {
  formatAbsoluteDmTime,
  formatDmBubbleTime,
} from '@/features/messages/dm-time';
import {
  type DmOutgoingDraft,
  isLocalDmMessageId,
  retainOutgoingAgainstArchive,
  revokeBlobUrls,
  shouldDecryptDmRecord,
  shouldRetainOutgoing,
} from '@/features/messages/dm-outgoing';
import {
  buildDmThreadRows,
  formatDmReplyPreview,
} from '@/features/messages/dm-thread-rows';
import { DmThreadComposer } from '@/features/messages/dm-thread-composer';
import { MessagesInboxSearchField } from '@/features/messages/messages-inbox-search-field';
import { messagesThreadChromeTitle } from '@/features/messages/messages-thread-chrome';
import { MessagesThreadChromeHeading } from '@/features/messages/messages-thread-chrome-heading';
import {
  MessagesInboxPeopleRows,
  MessagesInboxThreadRows,
} from '@/features/messages/messages-inbox-rows';
import {
  buildDmThreadId,
  messagingBlockedCopy,
  messagingBlockedReason,
} from '@/features/messages/messages-inbox-search';
import { useMessagesInboxSearch } from '@/features/messages/use-messages-inbox-search';
import { DmUnlockPanel } from '@/features/messages/dm-unlock-panel';
import {
  MESSAGES_PRIVATE_INFO_TITLE,
  MessagesPrivateInfoDrawer,
} from '@/features/messages/messages-private-info-drawer';
import { requestDmUnreadRefresh } from '@/components/providers/dm-unread-host';

const THREAD_POLL_MS = 12_000;
const THREAD_PAGE_SIZE = 50;

export function MessagesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerParam = searchParams.get('peer')?.trim().toLowerCase() ?? '';
  const threadParam = searchParams.get('thread')?.trim() ?? '';
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();

  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [messages, setMessages] = useState<DmMessageRecord[] | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [plainById, setPlainById] = useState<Record<string, string>>({});
  const [replyToById, setReplyToById] = useState<Record<string, string>>({});
  const [outgoing, setOutgoing] = useState<DmOutgoingDraft[]>([]);
  const [replyDraft, setReplyDraft] = useState<{
    messageId: string;
    preview: string;
  } | null>(null);
  const [peerMessagingReady, setPeerMessagingReady] = useState<
    'unknown' | 'ready' | 'absent' | 'unavailable'
  >('unknown');
  const [localMediaById, setLocalMediaById] = useState<
    Record<string, { url: string; mime: string }>
  >({});
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
  const [inboxPreviewByThread, setInboxPreviewByThread] = useState<
    Record<string, string>
  >({});
  const activeThreadIdRef = useRef(activeThreadId);
  const messagesRef = useRef(messages);
  const openThreadSeqRef = useRef(0);
  /** Bumps on account change so late async commits cannot leak across wallets. */
  const accountGenRef = useRef(0);
  const accountIdRef = useRef(accountId);
  const inboxPreviewCacheRef = useRef(
    new Map<string, { messageId: string; text: string }>()
  );
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const pinThreadToLatestRef = useRef(true);

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
  const threadOpen = Boolean(activeThreadId && isUnlocked);
  const viewport = useVisualViewportSheetMetrics(threadOpen);
  const keyboardOpen = threadOpen && viewport.isMobile && viewport.lift > 0;
  const [inboxSearchActive, setInboxSearchActive] = useState(false);
  const [privateInfoOpen, setPrivateInfoOpen] = useState(false);

  useEffect(() => {
    if (threadOpen) {
      setInboxSearchActive(false);
    }
  }, [threadOpen]);

  const passkeyEnrolled = Boolean(
    accountId && keysTick >= 0 && hasDmPasskeyEnrolled(accountId)
  );
  const canPasskey = canOfferDmPasskey();

  const peerFromThread = useMemo(() => {
    if (!activeThreadId || !accountId) return peerParam;
    const parts = activeThreadId.split('::');
    return parts.find((p) => p !== accountId.toLowerCase()) ?? peerParam;
  }, [activeThreadId, accountId, peerParam]);

  const peerIds = useMemo(() => {
    const ids = new Set((threads ?? []).map((t) => t.peerAccountId));
    if (peerFromThread) ids.add(peerFromThread);
    return [...ids];
  }, [peerFromThread, threads]);
  const profiles = usePostAuthorProfiles(peerIds);
  const peerMood = usePageOwnerMood(
    peerFromThread,
    threadOpen && Boolean(peerFromThread)
  );
  const threadMoodStyle = useMemo(
    () =>
      threadOpen && peerMood
        ? (supportSheetPanelStyle(peerMood.cssVars) as CSSProperties)
        : undefined,
    [peerMood, threadOpen]
  );

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

  const inboxPreviewJobs = useMemo(
    () =>
      (inboxThreads ?? [])
        .map((thread) => `${thread.threadId}:${thread.lastMessageId}`)
        .join('|'),
    [inboxThreads]
  );
  const inboxThreadsRef = useRef(inboxThreads);
  inboxThreadsRef.current = inboxThreads;
  const outgoingRef = useRef(outgoing);
  outgoingRef.current = outgoing;
  const localMediaByIdRef = useRef(localMediaById);
  localMediaByIdRef.current = localMediaById;
  const retryLockRef = useRef(new Set<string>());

  useEffect(() => {
    const archive = messages ?? [];
    const prev = outgoingRef.current;
    const next = retainOutgoingAgainstArchive(prev, archive);
    if (next.length === prev.length) return;
    const dropped = prev.filter(
      (item) => !next.some((kept) => kept.localId === item.localId)
    );
    revokeBlobUrls([
      ...dropped.map((item) => item.mediaPreviewUrl),
      ...dropped.flatMap((item) => [
        localMediaByIdRef.current[item.localId]?.url,
        item.messageId ? localMediaByIdRef.current[item.messageId]?.url : null,
      ]),
    ]);
    setOutgoing(next);
    setLocalMediaById((media) => {
      let changed = false;
      const copy = { ...media };
      for (const item of dropped) {
        if (copy[item.localId]) {
          delete copy[item.localId];
          changed = true;
        }
        if (item.messageId && copy[item.messageId]) {
          delete copy[item.messageId];
          changed = true;
        }
      }
      return changed ? copy : media;
    });
  }, [messages]);

  const inboxSearch = useMessagesInboxSearch({
    enabled: Boolean(isConnected && hasSocialSession),
    viewerAccountId: accountId,
    inboxThreads,
    sealedThreads,
    profiles,
    previews: inboxPreviewByThread,
  });
  const {
    query: inboxQuery,
    setQuery: setInboxQuery,
    clearSearch,
    isSearching,
    peopleActive,
    filteredThreads,
    peopleResults,
    peoplePending,
    peopleError,
  } = inboxSearch;
  const sealedThreadIds = useMemo(
    () => new Set(sealedThreads.map((thread) => thread.threadId)),
    [sealedThreads]
  );
  const displayMessages = useMemo(() => {
    const confirmed = messages ?? [];
    if (!accountId || !activeThreadId) return confirmed;
    const extras = outgoing
      .filter(
        (item) =>
          item.threadId === activeThreadId &&
          shouldRetainOutgoing(item, confirmed)
      )
      .map(
        (item): DmMessageRecord => ({
          id: item.localId,
          threadId: item.threadId,
          senderAccountId: accountId.toLowerCase(),
          recipientAccountId: item.peerAccountId,
          createdAt: item.createdAt,
          ciphertext: '',
          nonce: '',
          senderCiphertext: null,
          senderNonce: null,
          media: item.mediaFile
            ? [
                {
                  cid: item.localId,
                  mime: item.mediaMime || 'application/octet-stream',
                  size: item.mediaFile.size,
                },
              ]
            : null,
          senderPubkey: '',
          ephemeralPubkey: null,
          authTag: null,
        })
      );
    return [...confirmed, ...extras];
  }, [accountId, activeThreadId, messages, outgoing]);
  const outgoingById = useMemo(() => {
    const next = new Map<string, DmOutgoingDraft>();
    for (const item of outgoing) next.set(item.localId, item);
    return next;
  }, [outgoing]);
  const threadRows = useMemo(
    () => buildDmThreadRows(displayMessages),
    [displayMessages]
  );

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

  const rememberInboxPreview = useCallback(
    (threadId: string, messageId: string, text: string) => {
      if (!threadId || !text) return;
      inboxPreviewCacheRef.current.set(threadId, { messageId, text });
      setInboxPreviewByThread((prev) => {
        if (prev[threadId] === text) return prev;
        return { ...prev, [threadId]: text };
      });
    },
    []
  );

  const rememberPreviewFromPlain = useCallback(
    (
      threadId: string,
      msgs: DmMessageRecord[],
      plain: Record<string, string>
    ) => {
      const last = msgs.at(-1);
      if (!last) return;
      const preview = inboxPreviewFromDecrypted({
        text: plain[last.id],
        hasMedia: Boolean(last.media?.length),
      });
      if (preview) rememberInboxPreview(threadId, last.id, preview);
    },
    [rememberInboxPreview]
  );

  const releaseOutgoingMedia = useCallback(() => {
    revokeBlobUrls([
      ...outgoingRef.current.map((item) => item.mediaPreviewUrl),
      ...Object.values(localMediaByIdRef.current).map((item) => item.url),
    ]);
    setLocalMediaById({});
  }, []);

  const clearThreadState = useCallback(() => {
    openThreadSeqRef.current += 1;
    releaseOutgoingMedia();
    setThreads(null);
    setMessages(null);
    setHasMoreMessages(false);
    setPlainById({});
    setReplyToById({});
    setOutgoing([]);
    setReplyDraft(null);
    setInboxPreviewByThread({});
    inboxPreviewCacheRef.current.clear();
    setActiveThreadId('');
    setError(null);
    setRecoveryCode(null);
    setRecoveryVariant('created');
  }, [releaseOutgoingMedia]);

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

  const decryptPlaintextForMessage = useCallback(
    async (
      client: OnSocial,
      accountIdForKeys: string,
      msg: DmMessageRecord,
      senderKeyCache: Map<string, Awaited<ReturnType<typeof lookupDmPublicKey>>>
    ): Promise<{ text: string; replyToMessageId?: string }> => {
      try {
        const senderId = msg.senderAccountId.trim().toLowerCase();
        const viewerIsSender =
          senderId === accountIdForKeys.trim().toLowerCase();
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
        return await decryptDmMessage({
          client,
          accountId: accountIdForKeys,
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
        return { text: 'Unable to decrypt on this device.' };
      }
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
        return {};
      }
      const expectedAccount = accountId;
      const plain: Record<string, string> = {};
      const replies: Record<string, string> = {};
      const senderKeyCache = new Map<
        string,
        Awaited<ReturnType<typeof lookupDmPublicKey>>
      >();
      const decryptable = next.filter(shouldDecryptDmRecord);
      for (const msg of decryptable) {
        const opened = await decryptPlaintextForMessage(
          client,
          accountId,
          msg,
          senderKeyCache
        );
        plain[msg.id] = opened.text;
        if (opened.replyToMessageId) {
          replies[msg.id] = opened.replyToMessageId;
        }
      }
      if (activeThreadIdRef.current !== threadId) return plain;
      if (!isCurrentAccount(expectedAccount)) return plain;
      setPlainById((prev) => ({ ...prev, ...plain }));
      if (Object.keys(replies).length > 0) {
        setReplyToById((prev) => ({ ...prev, ...replies }));
      }
      const archiveChange = reconcileDmThreadArchiveAfterDecrypt({
        accountId: expectedAccount,
        threadId,
        messageIds: decryptable.map((msg) => msg.id),
        plainById: plain,
        isDecryptFailure: isDmDecryptFailureText,
      });
      if (archiveChange !== 'unchanged') {
        setArchiveTick((n) => n + 1);
      }
      rememberPreviewFromPlain(threadId, next, plain);
      return plain;
    },
    [
      accountId,
      decryptPlaintextForMessage,
      isCurrentAccount,
      rememberPreviewFromPlain,
    ]
  );

  const openThread = useCallback(
    async (threadId: string) => {
      const seq = ++openThreadSeqRef.current;
      const gen = accountGenRef.current;
      const expectedAccount = accountId;
      setActiveThreadId(threadId);
      setError(null);
      pinThreadToLatestRef.current = true;
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
      setPlainById((prev) => {
        const kept: Record<string, string> = {};
        for (const [id, text] of Object.entries(prev)) {
          if (id.startsWith('local:')) kept[id] = text;
        }
        return kept;
      });
      setReplyToById((prev) => {
        const kept: Record<string, string> = {};
        for (const [id, parent] of Object.entries(prev)) {
          if (id.startsWith('local:')) kept[id] = parent;
        }
        return kept;
      });
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

  const startChatFromPeer = useCallback(
    (peer: string) => {
      const target = peer.trim().toLowerCase();
      if (!accountId || !target) return;
      if (messagingBlockedReason(target)) return;
      clearSearch();
      void openThread(buildDmThreadId(accountId, target));
    },
    [accountId, clearSearch, messagingBlockedReason, openThread]
  );

  const handleOutgoingStart = useCallback(
    (draft: {
      localId: string;
      text: string;
      peerAccountId: string;
      replyToMessageId?: string;
      mediaFile?: File | null;
      mediaMime?: string | null;
    }) => {
      if (!accountId || !activeThreadIdRef.current) return;
      const mediaPreviewUrl = draft.mediaFile
        ? URL.createObjectURL(draft.mediaFile)
        : null;
      const next: DmOutgoingDraft = {
        localId: draft.localId,
        threadId: activeThreadIdRef.current,
        peerAccountId: draft.peerAccountId,
        text: draft.text,
        replyToMessageId: draft.replyToMessageId,
        createdAt: new Date().toISOString(),
        status: 'pending',
        mediaFile: draft.mediaFile,
        mediaPreviewUrl,
        mediaMime: draft.mediaMime,
      };
      setOutgoing((prev) => [...prev, next]);
      if (mediaPreviewUrl) {
        setLocalMediaById((prev) => ({
          ...prev,
          [draft.localId]: {
            url: mediaPreviewUrl,
            mime: draft.mediaMime || 'application/octet-stream',
          },
        }));
      }
      setPlainById((prev) => ({ ...prev, [draft.localId]: draft.text }));
      if (draft.replyToMessageId) {
        setReplyToById((prev) => ({
          ...prev,
          [draft.localId]: draft.replyToMessageId!,
        }));
      }
      const preview = inboxPreviewFromDecrypted({
        text: draft.text,
        hasMedia: Boolean(draft.mediaFile),
      });
      if (preview) {
        rememberInboxPreview(activeThreadIdRef.current, draft.localId, preview);
      }
      pinThreadToLatestRef.current = true;
    },
    [accountId, rememberInboxPreview]
  );

  const handleOutgoingConfirm = useCallback(
    (opts: { localId: string; messageId: string; threadId: string }) => {
      const draft = outgoingRef.current.find(
        (item) => item.localId === opts.localId
      );
      setOutgoing((prev) =>
        retainOutgoingAgainstArchive(
          prev.map((item) =>
            item.localId === opts.localId
              ? { ...item, status: 'confirmed', messageId: opts.messageId }
              : item
          ),
          messagesRef.current ?? []
        )
      );
      if (draft?.mediaPreviewUrl) {
        setLocalMediaById((prev) => {
          const next = { ...prev };
          next[opts.messageId] = {
            url: draft.mediaPreviewUrl!,
            mime: draft.mediaMime || 'application/octet-stream',
          };
          return next;
        });
      }
      if (!draft) return;
      setPlainById((prev) => ({
        ...prev,
        [opts.localId]: draft.text,
        [opts.messageId]: draft.text,
      }));
      if (draft.replyToMessageId) {
        setReplyToById((prev) => ({
          ...prev,
          [opts.localId]: draft.replyToMessageId!,
          [opts.messageId]: draft.replyToMessageId!,
        }));
      }
      const preview = inboxPreviewFromDecrypted({
        text: draft.text,
        hasMedia: Boolean(draft.mediaFile),
      });
      if (preview) {
        rememberInboxPreview(opts.threadId, opts.messageId, preview);
      }
    },
    [rememberInboxPreview]
  );

  const handleOutgoingFail = useCallback(
    (opts: { localId: string; error: string; needsUnlock?: boolean }) => {
      setOutgoing((prev) =>
        prev.map((item) =>
          item.localId === opts.localId
            ? { ...item, status: 'failed', error: opts.error }
            : item
        )
      );
      if (opts.needsUnlock) setKeysTick((n) => n + 1);
    },
    []
  );

  const handleOutgoingCancel = useCallback(
    (localId: string) => {
      const draft = outgoingRef.current.find(
        (item) => item.localId === localId
      );
      revokeBlobUrls([
        draft?.mediaPreviewUrl,
        localMediaByIdRef.current[localId]?.url,
      ]);
      setLocalMediaById((prev) => {
        if (!prev[localId]) return prev;
        const next = { ...prev };
        delete next[localId];
        return next;
      });
      setOutgoing((prev) => prev.filter((item) => item.localId !== localId));
      setPlainById((prev) => {
        const next = { ...prev };
        delete next[localId];
        return next;
      });
      setReplyToById((prev) => {
        const next = { ...prev };
        delete next[localId];
        return next;
      });
      if (draft?.replyToMessageId) {
        setReplyDraft({
          messageId: draft.replyToMessageId,
          preview: formatDmReplyPreview(
            plainById[draft.replyToMessageId],
            false
          ),
        });
      }
    },
    [plainById]
  );

  const retryOutgoing = useCallback(
    async (localId: string) => {
      const draft = outgoingRef.current.find(
        (item) => item.localId === localId
      );
      if (!draft || !accountId || retryLockRef.current.has(localId)) return;
      retryLockRef.current.add(localId);
      setOutgoing((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? { ...item, status: 'pending', error: undefined }
            : item
        )
      );
      try {
        const { client, session, wallet } = await getClient();
        if (!session) {
          handleOutgoingFail({
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
          recipientAccountId: draft.peerAccountId,
          text: draft.text,
          mediaFile: draft.mediaFile,
          replyToMessageId: draft.replyToMessageId,
        });
        if (!result.ok) {
          handleOutgoingFail({
            localId,
            error: result.error,
            needsUnlock: result.needsUnlock,
          });
          return;
        }
        handleOutgoingConfirm({
          localId,
          messageId: result.messageId,
          threadId: result.threadId,
        });
        void refreshThreads();
      } catch (cause) {
        handleOutgoingFail({
          localId,
          error:
            cause instanceof Error ? cause.message : 'Could not send message.',
        });
      } finally {
        retryLockRef.current.delete(localId);
      }
    },
    [
      accountId,
      getClient,
      handleOutgoingConfirm,
      handleOutgoingFail,
      refreshThreads,
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
        setLocalMediaById((prev) => {
          let changed = false;
          const nextMedia = { ...prev };
          for (const msg of merged) {
            if (!nextMedia[msg.id] || !shouldDecryptDmRecord(msg)) continue;
            revokeBlobUrls([nextMedia[msg.id]?.url]);
            delete nextMedia[msg.id];
            changed = true;
          }
          return changed ? nextMedia : prev;
        });
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
        if (threadParam) {
          await openThread(threadParam);
        } else if (peerParam) {
          await openThread(buildDmThreadId(accountId, peerParam));
        }
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
    peerParam,
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

  useEffect(() => {
    const snapshot = inboxThreadsRef.current;
    if (!isUnlocked || !accountId || !snapshot?.length) return;
    const gen = accountGenRef.current;
    const expectedAccount = accountId;
    let cancelled = false;
    void (async () => {
      try {
        const { client } = await withAuth();
        if (
          cancelled ||
          accountGenRef.current !== gen ||
          !isCurrentAccount(expectedAccount)
        ) {
          return;
        }
        const senderKeyCache = new Map<
          string,
          Awaited<ReturnType<typeof lookupDmPublicKey>>
        >();
        for (const thread of snapshot) {
          if (cancelled) return;
          const cached = inboxPreviewCacheRef.current.get(thread.threadId);
          if (cached?.messageId === thread.lastMessageId) continue;
          try {
            const { messages: page } = await client.dm.listMessages(
              thread.threadId,
              { limit: 1 }
            );
            if (
              cancelled ||
              accountGenRef.current !== gen ||
              !isCurrentAccount(expectedAccount)
            ) {
              return;
            }
            const last = page.at(-1);
            if (!last) continue;
            const opened = await decryptPlaintextForMessage(
              client,
              expectedAccount,
              last,
              senderKeyCache
            );
            const preview = inboxPreviewFromDecrypted({
              text: opened.text,
              hasMedia: Boolean(last.media?.length),
            });
            if (preview) {
              rememberInboxPreview(thread.threadId, last.id, preview);
            }
          } catch {
            // One thread failing should not block the rest of the inbox.
          }
        }
      } catch {
        // Soft hydrate — ignore transient auth / network errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    decryptPlaintextForMessage,
    inboxPreviewJobs,
    isCurrentAccount,
    isUnlocked,
    rememberInboxPreview,
    withAuth,
  ]);

  useEffect(() => {
    const el = scrollRootRef.current;
    if (!el || !threadOpen) return;
    const onScroll = () => {
      pinThreadToLatestRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [threadOpen, activeThreadId]);

  useEffect(() => {
    const el = scrollRootRef.current;
    if (!el || !threadOpen || !pinThreadToLatestRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [
    threadOpen,
    displayMessages,
    keyboardOpen,
    viewport.lift,
  ]);

  useEffect(() => {
    if (!isUnlocked || !peerFromThread || !hasSocialSession) {
      setPeerMessagingReady('unknown');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { client } = await withAuth();
        const lookup = await lookupDmPublicKey(client, peerFromThread);
        if (cancelled) return;
        if (lookup.status === 'absent') setPeerMessagingReady('absent');
        else if (lookup.status === 'unavailable') {
          setPeerMessagingReady('unavailable');
        } else setPeerMessagingReady('ready');
      } catch {
        if (!cancelled) setPeerMessagingReady('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSocialSession, isUnlocked, peerFromThread, withAuth]);

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
    setPlainById((prev) => {
      const kept: Record<string, string> = {};
      for (const [id, text] of Object.entries(prev)) {
        if (id.startsWith('local:')) kept[id] = text;
      }
      return kept;
    });
    setReplyDraft(null);
    setError(null);
    router.replace(messagesPath());
  }, [router]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeThreadId || !accountId || loadingOlder) return;
    const oldest = messagesRef.current?.[0];
    if (!oldest) return;
    pinThreadToLatestRef.current = false;
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

  if (!isConnected || !accountId) {
    return (
      <OsAppScreen
        title="Messages"
        compactChrome
        glassChrome
        backFallbackHref={APP_HOME_PATH}
        heading={<p className="os-app-screen-title">Messages</p>}
        actions={
          <OsIconAction
            ariaLabel={MESSAGES_PRIVATE_INFO_TITLE}
            aria-expanded={privateInfoOpen}
            aria-haspopup="dialog"
            onClick={() => setPrivateInfoOpen(true)}
          >
            <QuestionMarkCircleFillIcon
              aria-hidden
              className="glass-sheet-close-icon"
            />
          </OsIconAction>
        }
      >
        <OsAppChromePage className="messages-panel">
          <OsAppChromePageStatus>
            Private encrypted messages between OnSocial accounts.
          </OsAppChromePageStatus>
        </OsAppChromePage>
        <MessagesPrivateInfoDrawer
          open={privateInfoOpen}
          onClose={() => setPrivateInfoOpen(false)}
        />
      </OsAppScreen>
    );
  }

  if (!hasSocialSession) {
    return (
      <OsAppScreen
        title="Messages"
        compactChrome
        glassChrome
        backFallbackHref={APP_HOME_PATH}
        heading={<p className="os-app-screen-title">Messages</p>}
        actions={
          <OsIconAction
            ariaLabel={MESSAGES_PRIVATE_INFO_TITLE}
            aria-expanded={privateInfoOpen}
            aria-haspopup="dialog"
            onClick={() => setPrivateInfoOpen(true)}
          >
            <QuestionMarkCircleFillIcon
              aria-hidden
              className="glass-sheet-close-icon"
            />
          </OsIconAction>
        }
      >
        <OsAppChromePage className="messages-panel">
          <OsAppChromePageStatus>
            Connect your session to load private messages.
          </OsAppChromePageStatus>
        </OsAppChromePage>
        <MessagesPrivateInfoDrawer
          open={privateInfoOpen}
          onClose={() => setPrivateInfoOpen(false)}
        />
      </OsAppScreen>
    );
  }

  const messagesPane = threadOpen ? 'thread' : 'list';
  const keysLocked = !isUnlocked;
  const peerProfile = peerFromThread ? profiles[peerFromThread] : undefined;
  const peerName = peerFromThread
    ? displayName(peerFromThread, peerProfile?.displayName)
    : '';
  const peerHandle = peerFromThread ? fallbackLabel(peerFromThread) : '';

  const composer =
    peerFromThread && isUnlocked && activeThreadId ? (
      <DmThreadComposer
        peerAccountId={peerFromThread}
        disabled={peerMessagingReady === 'absent'}
        disabledReason={
          peerMessagingReady === 'absent' ? DM_PEER_MESSAGES_UNAVAILABLE : null
        }
        replyTo={replyDraft}
        onCancelReply={() => setReplyDraft(null)}
        onOutgoingStart={handleOutgoingStart}
        onOutgoingConfirm={handleOutgoingConfirm}
        onOutgoingFail={handleOutgoingFail}
        onOutgoingCancel={handleOutgoingCancel}
        onSent={() => {
          void refreshThreads();
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
          releaseOutgoingMedia();
          setOutgoing([]);
          setReplyDraft(null);
          setPlainById({});
          setReplyToById({});
          setRecoveryVariant('reset');
          setRecoveryCode(code);
          void handleUnlocked();
        }}
      />
    ) : null;

  const screenStyle = {
    ['--messages-keyboard-lift' as string]: keyboardOpen
      ? `${viewport.lift}px`
      : '0px',
  } as CSSProperties;

  const screenTitle = threadOpen
    ? messagesThreadChromeTitle(peerName, peerHandle)
    : 'Messages';
  const threadChromeHeading =
    threadOpen && peerFromThread ? (
      <MessagesThreadChromeHeading
        accountId={peerFromThread}
        profileName={peerProfile?.displayName}
        avatarUrl={peerProfile?.avatarUrl}
      />
    ) : null;
  const showPrivateInfoAction = !threadOpen;

  return (
    <OsAppScreen
      title={screenTitle}
      titleHref={
        !threadChromeHeading && threadOpen && peerFromThread
          ? `/${peerFromThread}`
          : undefined
      }
      compactChrome
      glassChrome
      scrollRootRef={scrollRootRef}
      moodId={threadOpen && peerMood ? peerMood.id : undefined}
      moodStyle={threadMoodStyle}
      leading={
        threadOpen ? (
          <ContextualBack onBack={closeThread} ariaLabel="Back to messages" />
        ) : null
      }
      style={screenStyle}
      heading={
        threadChromeHeading ??
        (keysLocked ? (
          <p className="os-app-screen-title">Messages</p>
        ) : !threadOpen ? (
          <MessagesInboxSearchField
            value={inboxQuery}
            onValueChange={setInboxQuery}
            onActiveChange={setInboxSearchActive}
          />
        ) : undefined)
      }
      actions={
        showPrivateInfoAction ? (
          <OsIconAction
            ariaLabel={MESSAGES_PRIVATE_INFO_TITLE}
            aria-expanded={privateInfoOpen}
            aria-haspopup="dialog"
            onClick={() => setPrivateInfoOpen(true)}
          >
            <QuestionMarkCircleFillIcon
              aria-hidden
              className="glass-sheet-close-icon"
            />
          </OsIconAction>
        ) : undefined
      }
    >
      <OsAppChromePage
        className="messages-panel"
        data-messages-pane={messagesPane}
        data-keys-locked={keysLocked ? 'true' : undefined}
        data-inbox-search={inboxSearchActive ? 'active' : undefined}
        data-keyboard={keyboardOpen ? 'open' : undefined}
      >
        {composer}
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
          <OsAppChromePageStatus error role="alert">
            {error}
          </OsAppChromePageStatus>
        ) : null}

        {!keysLocked ? (
        <div className="messages-layout" data-messages-pane={messagesPane}>
          <aside className="messages-thread-list" aria-label="Conversations">
            {threads == null ? (
              <OsAppChromePageStatus>Loading…</OsAppChromePageStatus>
            ) : isSearching ? (
              <>
                {filteredThreads.length === 0 ? (
                  <OsAppChromePageStatus>
                    No conversations match.
                  </OsAppChromePageStatus>
                ) : (
                  <>
                    {peopleActive ? (
                      <p className="messages-search-section">Conversations</p>
                    ) : null}
                    <MessagesInboxThreadRows
                      threads={filteredThreads}
                      ariaLabel="Matching conversations"
                      profiles={profiles}
                      inboxPreviewByThread={inboxPreviewByThread}
                      sealedThreadIds={sealedThreadIds}
                      activeThreadId={activeThreadId}
                      onOpenThread={(threadId) => {
                        clearSearch();
                        void openThread(threadId);
                      }}
                    />
                  </>
                )}
                {peopleActive ? (
                  <div className="messages-search-people">
                    <p className="messages-search-section">Start a chat</p>
                    {peoplePending ? (
                      <p className="messages-muted">Searching…</p>
                    ) : peopleError ? (
                      <p className="messages-muted">{peopleError}</p>
                    ) : peopleResults.length === 0 ? (
                      <p className="messages-muted">No matches.</p>
                    ) : (
                      <MessagesInboxPeopleRows
                        people={peopleResults}
                        ariaLabel="Start a chat"
                        isBlocked={messagingBlockedReason}
                        blockedCopy={messagingBlockedCopy}
                        onOpenPerson={startChatFromPeer}
                      />
                    )}
                  </div>
                ) : null}
              </>
            ) : threads.length === 0 ? (
              <OsAppChromePageStatus>
                No conversations yet. Search to start a chat, or message them
                from their profile.
              </OsAppChromePageStatus>
            ) : inboxThreads &&
              inboxThreads.length === 0 &&
              sealedThreads.length > 0 ? (
              <OsAppChromePageStatus>
                No open conversations. Sealed threads from before a key reset
                are below.
              </OsAppChromePageStatus>
            ) : inboxThreads && inboxThreads.length === 0 ? (
              <OsAppChromePageStatus>
                No conversations yet. Search to start a chat, or message them
                from their profile.
              </OsAppChromePageStatus>
            ) : (
              <MessagesInboxThreadRows
                threads={inboxThreads ?? []}
                ariaLabel="Conversations"
                profiles={profiles}
                inboxPreviewByThread={inboxPreviewByThread}
                activeThreadId={activeThreadId}
                onOpenThread={(threadId) => void openThread(threadId)}
              />
            )}
            {!isSearching && sealedThreads.length > 0 ? (
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
                  <MessagesInboxThreadRows
                    threads={sealedThreads}
                    ariaLabel="Sealed conversations"
                    profiles={profiles}
                    inboxPreviewByThread={inboxPreviewByThread}
                    treatAllAsSealed
                    activeThreadId={activeThreadId}
                    onOpenThread={(threadId) => void openThread(threadId)}
                  />
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="messages-thread" aria-label="Thread">
              {!activeThreadId ? (
                <OsAppChromePageStatus className="messages-thread-empty">
                  Pick a conversation, search to start a chat, or message them
                  from their profile.
                </OsAppChromePageStatus>
              ) : !isUnlocked ? (
                <OsAppChromePageStatus>
                  Unlock messages to read this conversation.
                </OsAppChromePageStatus>
              ) : messages == null ? (
                <OsAppChromePageStatus>Loading…</OsAppChromePageStatus>
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
                    {threadRows.map((row) => {
                      if (row.kind === 'day') {
                        return (
                          <li
                            key={row.key}
                            className="messages-day-rule"
                            aria-label={row.label}
                          >
                            <span>{row.label}</span>
                          </li>
                        );
                      }
                      const msg = row.message;
                      const mine =
                        msg.senderAccountId === accountId.toLowerCase();
                      const text = plainById[msg.id];
                      const bubbleTime = formatDmBubbleTime(msg.createdAt);
                      const absolute = formatAbsoluteDmTime(msg.createdAt);
                      const parentId = replyToById[msg.id];
                      const parentText = parentId
                        ? plainById[parentId]
                        : undefined;
                      const parentMine =
                        parentId != null &&
                        displayMessages.some(
                          (item) =>
                            item.id === parentId &&
                            item.senderAccountId === accountId.toLowerCase()
                        );
                      const draft = outgoingById.get(msg.id);
                      const localMedia =
                        localMediaById[msg.id] ??
                        (draft?.messageId
                          ? localMediaById[draft.messageId]
                          : undefined);
                      const replyMessageId = draft?.messageId ?? msg.id;
                      const canReply =
                        (!draft || draft.status === 'confirmed') &&
                        text != null &&
                        !isDmDecryptFailureText(text) &&
                        !isLocalDmMessageId(replyMessageId);
                      const bubbleClass = [
                        'messages-bubble',
                        mine ? 'is-mine' : '',
                        draft?.status === 'pending' ? 'is-pending' : '',
                        draft?.status === 'failed' ? 'is-failed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <li key={msg.id} className={bubbleClass}>
                          {parentId ? (
                            <blockquote className="messages-bubble-quote">
                              <span>
                                {parentText != null
                                  ? parentMine
                                    ? 'You'
                                    : peerName || 'Them'
                                  : 'Earlier message'}
                              </span>
                              {parentText != null ? (
                                <p>{formatDmReplyPreview(parentText)}</p>
                              ) : null}
                            </blockquote>
                          ) : null}
                          {text != null ? (
                            text ? (
                              <p>{text}</p>
                            ) : null
                          ) : (
                            <p>…</p>
                          )}
                          {localMedia ? (
                            localMedia.mime.startsWith('video/') ? (
                              <video
                                src={localMedia.url}
                                className="messages-media"
                                muted
                                playsInline
                                controls
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={localMedia.url}
                                alt=""
                                className="messages-media"
                              />
                            )
                          ) : msg.media?.length ? (
                            msg.media.map((item) => (
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
                          ) : null}
                          <div className="messages-bubble-meta">
                            {draft?.status === 'pending' ? (
                              <PulsingDots size="sm" label="Sending" />
                            ) : draft?.status === 'failed' ? (
                              <button
                                type="button"
                                className="messages-bubble-retry"
                                onClick={() => void retryOutgoing(msg.id)}
                              >
                                {draft.error || 'Couldn’t send'} · Retry
                              </button>
                            ) : bubbleTime ? (
                              <time
                                dateTime={msg.createdAt}
                                title={absolute || undefined}
                              >
                                {bubbleTime}
                              </time>
                            ) : null}
                            {canReply ? (
                              <button
                                type="button"
                                className="messages-bubble-reply"
                                onClick={() =>
                                  setReplyDraft({
                                    messageId: replyMessageId,
                                    preview: formatDmReplyPreview(
                                      text,
                                      Boolean(
                                        msg.media?.length || draft?.mediaFile
                                      )
                                    ),
                                  })
                                }
                              >
                                Reply
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
          </section>
        </div>
        ) : null}

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
        <MessagesPrivateInfoDrawer
          open={privateInfoOpen}
          onClose={() => setPrivateInfoOpen(false)}
        />
      </OsAppChromePage>
    </OsAppScreen>
  );
}
