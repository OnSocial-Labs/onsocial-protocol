import { describe, expect, it } from 'vitest';
import {
  __resetDmStoreForTests,
  buildDmThreadId,
  listDmMessages,
  listDmThreads,
  markDmThreadRead,
  sendDmMessage,
} from '../../src/services/dm/index.js';

describe('dm mailbox service', () => {
  it('stores ciphertext and lists threads for both peers', async () => {
    __resetDmStoreForTests();
    const sent = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'pk',
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

    const msgs = await listDmMessages('bob.testnet', sent.threadId);
    expect(Array.isArray(msgs)).toBe(true);
    if (Array.isArray(msgs)) {
      expect(msgs[0]?.ciphertext).toBe('cipher');
    }

    await markDmThreadRead('bob.testnet', sent.threadId, {
      lastReadMessageId: sent.id,
    });
    const bobAfter = await listDmThreads('bob.testnet');
    if (Array.isArray(bobAfter)) {
      expect(bobAfter[0]?.unread).toBe(false);
    }
  });

  it('rejects self messages', async () => {
    __resetDmStoreForTests();
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'alice.testnet',
      ciphertext: 'x',
      nonce: 'n',
      senderPubkey: 'pk',
    });
    expect(result).toMatchObject({ code: 'SELF_MESSAGE' });
  });

  it('counts unread threads for the recipient', async () => {
    __resetDmStoreForTests();
    const { countUnreadDmThreads } = await import(
      '../../src/services/dm/index.js'
    );
    await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'pk',
    });
    const unread = await countUnreadDmThreads('bob.testnet');
    expect(unread).toBe(1);
    const aliceUnread = await countUnreadDmThreads('alice.testnet');
    expect(aliceUnread).toBe(0);
  });

  it('persists per-message ephemeral pubkey and auth tag', async () => {
    __resetDmStoreForTests();
    const sent = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'identity-pk',
      ephemeralPubkey: 'ephemeral-pk',
      authTag: 'auth-tag',
    });
    expect('code' in sent).toBe(false);
    if ('code' in sent) return;
    expect(sent.ephemeralPubkey).toBe('ephemeral-pk');
    expect(sent.authTag).toBe('auth-tag');

    const msgs = await listDmMessages('bob.testnet', sent.threadId);
    expect(Array.isArray(msgs)).toBe(true);
    if (Array.isArray(msgs)) {
      expect(msgs[0]?.ephemeralPubkey).toBe('ephemeral-pk');
      expect(msgs[0]?.senderPubkey).toBe('identity-pk');
      expect(msgs[0]?.authTag).toBe('auth-tag');
    }
  });

  it('rejects authTag without ephemeral pubkey', async () => {
    __resetDmStoreForTests();
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

  it('rejects oversized media', async () => {
    __resetDmStoreForTests();
    const result = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'cipher',
      nonce: 'nonce',
      senderPubkey: 'pk',
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
    __resetDmStoreForTests();
    await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'from-alice',
      nonce: 'n1',
      senderPubkey: 'pk-a',
    });
    await sendDmMessage({
      senderAccountId: 'bob.testnet',
      recipientAccountId: 'alice.testnet',
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

  it('returns the newest page of messages when limited', async () => {
    __resetDmStoreForTests();
    let threadId = '';
    for (let i = 0; i < 5; i += 1) {
      const sent = await sendDmMessage({
        senderAccountId: 'alice.testnet',
        recipientAccountId: 'bob.testnet',
        ciphertext: `cipher-${i}`,
        nonce: `nonce-${i}`,
        senderPubkey: 'pk',
      });
      expect('code' in sent).toBe(false);
      if ('code' in sent) return;
      threadId = sent.threadId;
      // Ensure distinct createdAt ordering in memory store.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const msgs = await listDmMessages('bob.testnet', threadId, 3);
    expect(Array.isArray(msgs)).toBe(true);
    if (!Array.isArray(msgs)) return;
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.ciphertext)).toEqual([
      'cipher-2',
      'cipher-3',
      'cipher-4',
    ]);
  });

  it('derives read watermark only from message id', async () => {
    __resetDmStoreForTests();
    const first = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'one',
      nonce: 'n1',
      senderPubkey: 'pk',
    });
    expect('code' in first).toBe(false);
    if ('code' in first) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await sendDmMessage({
      senderAccountId: 'alice.testnet',
      recipientAccountId: 'bob.testnet',
      ciphertext: 'two',
      nonce: 'n2',
      senderPubkey: 'pk',
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
