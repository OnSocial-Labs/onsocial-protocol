import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { DmThreadSummary } from '@onsocial/sdk';
import {
  MESSAGES_INBOX_SESSION_TTL_MS,
  clearMessagesInboxSession,
  peekMessagesInboxSession,
  readMessagesInboxSession,
  writeMessagesInboxSession,
} from './messages-inbox-session';

function thread(peer: string): DmThreadSummary {
  return {
    threadId: `alice.near::${peer}`,
    peerAccountId: peer,
    lastMessageAt: '2026-09-21T00:00:00.000Z',
    lastMessageId: 'm1',
    unread: false,
  };
}

afterEach(() => {
  clearMessagesInboxSession();
});

describe('messages inbox session snapshot', () => {
  it('round-trips threads, previews, and scroll in memory', () => {
    const threads = [thread('bob.near')];
    const inboxPreviewByThread = { 'alice.near::bob.near': 'hello' };
    writeMessagesInboxSession({
      accountId: 'alice.near',
      threads,
      inboxPreviewByThread,
      scrollTop: 320,
    });

    const snapped = peekMessagesInboxSession();
    expect(snapped?.accountId).toBe('alice.near');
    expect(snapped?.threads).toEqual(threads);
    expect(snapped?.threads).not.toBe(threads);
    expect(snapped?.inboxPreviewByThread).toEqual(inboxPreviewByThread);
    expect(snapped?.inboxPreviewByThread).not.toBe(inboxPreviewByThread);
    expect(snapped?.scrollTop).toBe(320);

    expect(readMessagesInboxSession('alice.near')?.scrollTop).toBe(320);
    expect(readMessagesInboxSession('ALICE.near')?.threads).toHaveLength(1);
    expect(readMessagesInboxSession('bob.near')).toBeNull();
  });

  it('stores an empty inbox so a known empty does not skeleton', () => {
    writeMessagesInboxSession({
      accountId: 'alice.near',
      threads: [],
      inboxPreviewByThread: {},
      scrollTop: 0,
    });
    expect(peekMessagesInboxSession()?.threads).toEqual([]);
  });

  it('does not store ciphertext or keys, and skips an unfetched inbox', () => {
    writeMessagesInboxSession({
      accountId: 'alice.near',
      threads: null,
      inboxPreviewByThread: {},
      scrollTop: 12,
    });
    expect(peekMessagesInboxSession()).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeMessagesInboxSession({
      accountId: 'alice.near',
      threads: [thread('bob.near')],
      inboxPreviewByThread: {},
      scrollTop: 80,
      now: 1_000,
    });
    expect(
      peekMessagesInboxSession(1_000 + MESSAGES_INBOX_SESSION_TTL_MS + 1)
    ).toBeNull();
  });
});

describe('messages inbox session wiring', () => {
  it('restores the thread list on remount and does not persist to storage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const panelSrc = readFileSync(
      join(libDir, '../features/messages/messages-panel.tsx'),
      'utf8'
    );
    expect(panelSrc).toContain('peekMessagesInboxSession');
    expect(panelSrc).toContain('writeMessagesInboxSession');
    expect(panelSrc).toContain('readMessagesInboxSession');
    expect(panelSrc).not.toContain('localStorage.setItem');
    expect(panelSrc).not.toContain('sessionStorage.setItem');
  });
});
