import type { HttpClient } from '../internal/http.js';

export interface DmMediaRef {
  cid: string;
  mime: string;
  size: number;
  /** Recipient-box nonce (legacy single-seal uploads). */
  nonce?: string;
  /** Sender self-copy nonce when dual-sealed outside the envelope. */
  senderNonce?: string;
}

export interface DmMessageRecord {
  id: string;
  threadId: string;
  senderAccountId: string;
  recipientAccountId: string;
  createdAt: string;
  ciphertext: string;
  nonce: string;
  senderCiphertext: string | null;
  senderNonce: string | null;
  media: DmMediaRef[] | null;
  /** Long-term identity pubkey (attribution). */
  senderPubkey: string;
  /** Per-message ephemeral pubkey for forward secrecy (v2+). */
  ephemeralPubkey: string | null;
  /** Sender-authenticated MAC binding identity to the envelope. */
  authTag: string | null;
}

export interface DmThreadSummary {
  threadId: string;
  peerAccountId: string;
  lastMessageAt: string;
  lastMessageId: string;
  unread: boolean;
}

export interface SendDmInput {
  recipientAccountId: string;
  ciphertext: string;
  nonce: string;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  senderPubkey: string;
  /** Per-message ephemeral pubkey (forward secrecy). */
  ephemeralPubkey?: string | null;
  /** Sender-authenticated MAC (required for new envelopes). */
  authTag?: string | null;
  media?: DmMediaRef[] | null;
}

export interface ListDmMessagesOptions {
  limit?: number;
  /**
   * Load messages older than this id (cursor pagination).
   * Pass the oldest message id currently displayed.
   */
  beforeMessageId?: string;
}

/**
 * Private E2EE DM mailbox via gateway.
 * Client encrypts before send; server stores ciphertext only.
 */
export class DmModule {
  constructor(private readonly http: HttpClient) {}

  async listThreads(): Promise<{ threads: DmThreadSummary[] }> {
    return this.http.get<{ threads: DmThreadSummary[] }>(
      '/developer/dm/threads'
    );
  }

  async listMessages(
    threadId: string,
    opts?: ListDmMessagesOptions
  ): Promise<{ messages: DmMessageRecord[]; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    if (opts?.beforeMessageId) {
      qs.set('beforeMessageId', opts.beforeMessageId);
    }
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return this.http.get<{ messages: DmMessageRecord[]; hasMore: boolean }>(
      `/developer/dm/threads/${encodeURIComponent(threadId)}${q}`
    );
  }

  async send(input: SendDmInput): Promise<DmMessageRecord> {
    const res = await this.http.post<{ message: DmMessageRecord }>(
      '/developer/dm/send',
      {
        recipientAccountId: input.recipientAccountId,
        ciphertext: input.ciphertext,
        nonce: input.nonce,
        senderCiphertext: input.senderCiphertext ?? null,
        senderNonce: input.senderNonce ?? null,
        senderPubkey: input.senderPubkey,
        ephemeralPubkey: input.ephemeralPubkey ?? null,
        authTag: input.authTag ?? null,
        media: input.media ?? null,
      }
    );
    return res.message;
  }

  async markRead(
    threadId: string,
    opts: { lastReadMessageId: string }
  ): Promise<void> {
    await this.http.post('/developer/dm/read', {
      threadId,
      lastReadMessageId: opts.lastReadMessageId,
    });
  }

  async unreadCount(): Promise<{ unread: number }> {
    return this.http.get<{ unread: number }>('/developer/dm/unread-count');
  }
}
