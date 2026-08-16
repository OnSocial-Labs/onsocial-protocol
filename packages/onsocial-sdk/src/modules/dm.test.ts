import { describe, expect, it, vi } from 'vitest';
import { DmModule } from './dm.js';
import type { HttpClient } from '../internal/http.js';

function mockHttp(handlers: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
}): HttpClient {
  return {
    get: handlers.get ?? vi.fn(),
    post: handlers.post ?? vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  } as unknown as HttpClient;
}

describe('DmModule', () => {
  it('lists threads and sends sealed payloads', async () => {
    const get = vi.fn().mockResolvedValue({
      threads: [
        {
          threadId: 'a::b',
          peerAccountId: 'bob.testnet',
          lastMessageAt: '2026-01-01T00:00:00.000Z',
          lastMessageId: '1',
          unread: false,
        },
      ],
    });
    const post = vi.fn().mockResolvedValue({
      message: {
        id: '1',
        threadId: 'a::b',
        senderAccountId: 'alice.testnet',
        recipientAccountId: 'bob.testnet',
        createdAt: '2026-01-01T00:00:00.000Z',
        ciphertext: 'c',
        nonce: 'n',
        senderCiphertext: 'sc',
        senderNonce: 'sn',
        media: null,
        senderPubkey: 'pk',
        ephemeralPubkey: 'epk',
        authTag: 'tag',
      },
    });
    const dm = new DmModule(mockHttp({ get, post }));
    const { threads } = await dm.listThreads();
    expect(threads).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/developer/dm/threads');

    get.mockResolvedValueOnce({ unread: 2 });
    const unread = await dm.unreadCount();
    expect(unread).toEqual({ unread: 2 });
    expect(get).toHaveBeenCalledWith('/developer/dm/unread-count');

    const message = await dm.send({
      recipientAccountId: 'bob.testnet',
      ciphertext: 'c',
      nonce: 'n',
      senderCiphertext: 'sc',
      senderNonce: 'sn',
      senderPubkey: 'pk',
      ephemeralPubkey: 'epk',
      authTag: 'tag',
    });
    expect(message.threadId).toBe('a::b');
    expect(post).toHaveBeenCalledWith(
      '/developer/dm/send',
      expect.objectContaining({
        recipientAccountId: 'bob.testnet',
        authTag: 'tag',
        ephemeralPubkey: 'epk',
      })
    );

    await dm.markRead('a::b', { lastReadMessageId: '1' });
    expect(post).toHaveBeenCalledWith('/developer/dm/read', {
      threadId: 'a::b',
      lastReadMessageId: '1',
    });
  });
});
