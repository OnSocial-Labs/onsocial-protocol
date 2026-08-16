import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/blocks/index.js', () => ({
  checkBlockEitherWay: vi.fn(async () => ({ ok: true, blocked: false })),
  hasBlockEitherWay: vi.fn(async () => false),
}));

vi.mock('../../src/services/mutes/index.js', () => ({
  checkMute: vi.fn(async () => ({ ok: true, muted: false })),
  hasMute: vi.fn(async () => false),
}));

vi.mock('../../src/services/notifications/index.js', () => ({
  markDmNotificationsReadForThread: vi.fn(async () => 0),
}));

import {
  __resetDmStoreForTests,
  buildDmThreadId,
  listDmMessages,
  listDmThreads,
  markDmThreadRead,
  sendDmMessage,
} from '../../src/services/dm/index.js';
import { checkBlockEitherWay } from '../../src/services/blocks/index.js';
import { checkMute } from '../../src/services/mutes/index.js';
import { markDmNotificationsReadForThread } from '../../src/services/notifications/index.js';

const sealed = {
  ciphertext: 'cipher',
  nonce: 'nonce',
  senderPubkey: 'identity-pk',
  ephemeralPubkey: 'ephemeral-pk',
  authTag: 'auth-tag',
};

describe('dm mailbox service', () => {
  beforeEach(() => {
    __resetDmStoreForTests();
    vi.mocked(checkBlockEitherWay).mockResolvedValue({
      ok: true,
      blocked: false,
    });
    vi.mocked(checkMute).mockResolvedValue({ ok: true, muted: false });
    vi.mocked(markDmNotificationsReadForThread).mockResolvedValue(0);
  });

  it('stores ciphertext and lists threads for both peers', async () => {
    const sent = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    expect('code' in sent).toBe(false);
    if ('code' in sent) return;

    expect(sent.threadId).toBe(buildDmThreadId('alice.testnet', 'bob.testnet'));

    const aliceThreads = await listDmThreads('alice.testnet');
    const bobThreads = await listDmThreads('bob.testnet');
    expect(Array.isArray(aliceThreads)).toBe(true);
    expect(Array.isArray(bobThreads)).toBe(true);
    if (Array.isArray(aliceThreads) && Array.isArray(bobThreads)) {
      expect(aliceThreads[0]?.peerAccountId).toBe('bob.testnet');
      expect(bobThreads[0]?.unread).toBe(true);
    }

    const listed = await listDmMessages('bob.testnet', sent.threadId);
    expect('code' in listed).toBe(false);
    if ('code' in listed) return;
    expect(listed.messages[0]?.ciphertext).toBe('cipher');
    expect(listed.hasMore).toBe(false);

    await markDmThreadRead('bob.testnet', sent.threadId, {
      lastReadMessageId: sent.id,
    });
    expect(markDmNotificationsReadForThread).toHaveBeenCalledWith(
      'bob.testnet',
      sent.threadId
    );
    const bobAfter = await listDmThreads('bob.testnet');
    if (Array.isArray(bobAfter)) {
      expect(bobAfter[0]?.unread).toBe(false);
    }
  });

  it('rejects self messages', async () => {
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'alice.testnet',
      ...sealed,
    });
    expect(result).toMatchObject({ code: 'SELF_MESSAGE' });
  });

  it('fails closed when block check is unavailable', async () => {
    vi.mocked(checkBlockEitherWay).mockResolvedValueOnce({
      ok: false,
      unavailable: true,
    });
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    expect(result).toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('fails closed when mute check is unavailable', async () => {
    vi.mocked(checkMute).mockResolvedValueOnce({
      ok: false,
      unavailable: true,
    });
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    expect(result).toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('rejects when either peer has muted the other', async () => {
    vi.mocked(checkMute).mockImplementation(async (owner, target) => {
      if (owner === 'bob.testnet' && target === 'alice.testnet') {
        return { ok: true, muted: true };
      }
      return { ok: true, muted: false };
    });
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    expect(result).toMatchObject({
      code: 'MUTED',
      message: expect.stringMatching(/muted you/i),
    });
  });

  it('counts unread threads for the recipient', async () => {
    const { countUnreadDmThreads } = await import(
      '../../src/services/dm/index.js'
    );
    await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    const unread = await countUnreadDmThreads('bob.testnet');
    expect(unread).toBe(1);
    const aliceUnread = await countUnreadDmThreads('alice.testnet');
    expect(aliceUnread).toBe(0);
  });

  it('persists per-message ephemeral pubkey and auth tag', async () => {
    const sent = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
    });
    expect('code' in sent).toBe(false);
    if ('code' in sent) return;
    expect(sent.ephemeralPubkey).toBe('ephemeral-pk');
    expect(sent.authTag).toBe('auth-tag');

    const listed = await listDmMessages('bob.testnet', sent.threadId);
    expect('code' in listed).toBe(false);
    if ('code' in listed) return;
    expect(listed.messages[0]?.ephemeralPubkey).toBe('ephemeral-pk');
    expect(listed.messages[0]?.senderPubkey).toBe('identity-pk');
    expect(listed.messages[0]?.authTag).toBe('auth-tag');
  });

  it('rejects send without ephemeral pubkey', async () => {
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'pk',
      authTag: 'tag',
    });
    expect(result).toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('rejects send without authTag', async () => {
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'pk',
      ephemeralPubkey: 'ephemeral-pk',
    });
    expect(result).toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('rejects oversized media', async () => {
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
      media: [
        {
          cid: 'bafy',
          mime: 'image/png',
          size: 20 * 1024 * 1024,
        },
      ],
    });
    expect(result).toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('keeps unread after recipient replies without reading', async () => {
    await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
      ciphertext: 'from-alice',
      nonce: 'n1',
      senderPubkey: 'pk-a',
    });
    await sendDmMessage({
      senderAccountId: 'bob.testnet',
      recipientAccountId: 'alice.testnet',
      ...sealed,
      ciphertext: 'from-bob',
      nonce: 'n2',
      senderPubkey: 'pk-b',
    });
    const bobThreads = await listDmThreads('bob.testnet');
    expect(Array.isArray(bobThreads)).toBe(true);
    if (Array.isArray(bobThreads)) {
      expect(bobThreads[0]?.unread).toBe(true);
    }
  });

  it('returns the newest page and pages older with beforeMessageId', async () => {
    let threadId = '';
    for (let i = 0; i < 5; i += 1) {
      const sent = await sendDmMessage({
        senderAccountId: 'alice.testnet',
        recipientAccountId: 'bob.testnet',
        ...sealed,
        ciphertext: `cipher-${i}`,
        nonce: `nonce-${i}`,
      });
      expect('code' in sent).toBe(false);
      if ('code' in sent) return;
      threadId = sent.threadId;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const newest = await listDmMessages('bob.testnet', threadId, { limit: 3 });
    expect('code' in newest).toBe(false);
    if ('code' in newest) return;
    expect(newest.hasMore).toBe(true);
    expect(newest.messages.map((m) => m.ciphertext)).toEqual([
      'cipher-2',
      'cipher-3',
      'cipher-4',
    ]);

    const older = await listDmMessages('bob.testnet', threadId, {
      limit: 3,
      beforeMessageId: newest.messages[0]!.id,
    });
    expect('code' in older).toBe(false);
    if ('code' in older) return;
    expect(older.hasMore).toBe(false);
    expect(older.messages.map((m) => m.ciphertext)).toEqual([
      'cipher-0',
      'cipher-1',
    ]);
  });

  it('derives read watermark only from message id', async () => {
    const first = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
      ciphertext: 'one',
      nonce: 'n1',
    });
    expect('code' in first).toBe(false);
    if ('code' in first) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ...sealed,
      ciphertext: 'two',
      nonce: 'n2',
    });
    expect('code' in second).toBe(false);
    if ('code' in second) return;

    await markDmThreadRead('bob.testnet', first.threadId, {
      lastReadMessageId: first.id,
    });
    const mid = await listDmThreads('bob.testnet');
    expect(Array.isArray(mid)).toBe(true);
    if (Array.isArray(mid)) {
      expect(mid[0]?.unread).toBe(true);
    }

    await markDmThreadRead('bob.testnet', first.threadId, {
      lastReadMessageId: second.id,
    });
    const after = await listDmThreads('bob.testnet');
    expect(Array.isArray(after)).toBe(true);
    if (Array.isArray(after)) {
      expect(after[0]?.unread).toBe(false);
    }

    const missing = await markDmThreadRead('bob.testnet', first.threadId, {
      lastReadMessageId: 'missing-id',
    });
    expect(missing).toMatchObject({ code: 'NOT_FOUND' });
  });
});
