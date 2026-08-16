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
  media?: DmMediaRef[] | null;
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
    opts?: { limit?: number }
  ): Promise<{ messages: DmMessageRecord[] }> {
    const q =
      opts?.limit != null
        ? `?limit=${encodeURIComponent(String(opts.limit))}`
        : '';
    return this.http.get<{ messages: DmMessageRecord[] }>(
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
        media: input.media ?? null,
      }
    );
    return res.message;
  }

  async markRead(threadId: string): Promise<void> {
    await this.http.post('/developer/dm/read', { threadId });
  }

  async unreadCount(): Promise<{ unread: number }> {
    return this.http.get<{ unread: number }>('/developer/dm/unread-count');
  }
}
