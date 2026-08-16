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

    await markDmThreadRead('bob.testnet', sent.threadId);
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
});
