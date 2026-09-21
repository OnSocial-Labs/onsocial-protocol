import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Notification } from '@onsocial/sdk';
import {
  ACTIVITY_INBOX_SESSION_TTL_MS,
  clearActivityInboxSession,
  peekActivityInboxSession,
  readActivityInboxSession,
  writeActivityInboxSession,
} from './activity-inbox-session';

function row(id: string, recipient: string): Notification {
  return {
    id,
    recipient,
    actor: 'bob.near',
    type: 'stand',
    dedupeKey: null,
    read: false,
    source: { contract: null, receiptId: null, blockHeight: null },
    context: null,
    createdAt: '2026-09-21T00:00:00.000Z',
  };
}

afterEach(() => {
  clearActivityInboxSession();
});

describe('activity inbox session snapshot', () => {
  it('round-trips rows, cursor, and scroll in memory', () => {
    const items = [row('1', 'alice.near'), row('2', 'alice.near')];
    writeActivityInboxSession({
      accountId: 'alice.near',
      items,
      nextCursor: 'c2',
      scrollTop: 480,
    });

    const snapped = peekActivityInboxSession();
    expect(snapped?.accountId).toBe('alice.near');
    expect(snapped?.items).toEqual(items);
    expect(snapped?.items).not.toBe(items);
    expect(snapped?.nextCursor).toBe('c2');
    expect(snapped?.scrollTop).toBe(480);

    expect(readActivityInboxSession('alice.near')?.scrollTop).toBe(480);
    expect(readActivityInboxSession('ALICE.near')?.items).toHaveLength(2);
    expect(readActivityInboxSession('bob.near')).toBeNull();
  });

  it('stores an empty inbox so a known empty does not skeleton', () => {
    writeActivityInboxSession({
      accountId: 'alice.near',
      items: [],
      nextCursor: null,
      scrollTop: 0,
    });
    expect(peekActivityInboxSession()?.items).toEqual([]);
  });

  it('does not store before the first fetch', () => {
    writeActivityInboxSession({
      accountId: 'alice.near',
      items: null,
      nextCursor: null,
      scrollTop: 12,
    });
    expect(peekActivityInboxSession()).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeActivityInboxSession({
      accountId: 'alice.near',
      items: [row('1', 'alice.near')],
      nextCursor: null,
      scrollTop: 80,
      now: 1_000,
    });
    expect(
      peekActivityInboxSession(1_000 + ACTIVITY_INBOX_SESSION_TTL_MS + 1)
    ).toBeNull();
  });
});

describe('activity inbox session wiring', () => {
  it('restores from memory on remount and does not persist to storage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const panelSrc = readFileSync(
      join(libDir, '../features/notifications/notifications-panel.tsx'),
      'utf8'
    );
    expect(panelSrc).toContain('peekActivityInboxSession');
    expect(panelSrc).toContain('writeActivityInboxSession');
    expect(panelSrc).toContain('readActivityInboxSession');
    expect(panelSrc).not.toContain('localStorage');
    expect(panelSrc).not.toContain('sessionStorage.setItem');
  });
});
