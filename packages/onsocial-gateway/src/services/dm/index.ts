import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { logger } from '../../logger.js';
import { checkBlockEitherWay } from '../blocks/index.js';
import { hasMute } from '../mutes/index.js';

export interface DmMediaRef {
  cid: string;
  mime: string;
  size: number;
  /** Optional — dual-seal envelope may embed nonces in the CID blob. */
  nonce?: string;
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

export interface DmSendInput {
  senderAccountId: string;
  recipientAccountId: string;
  ciphertext: string;
  nonce: string;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  senderPubkey: string;
  ephemeralPubkey?: string | null;
  media?: DmMediaRef[] | null;
}

export type DmErrorCode =
  | 'INVALID_ACCOUNT'
  | 'SELF_MESSAGE'
  | 'BLOCKED'
  | 'MUTED'
  | 'UNAVAILABLE'
  | 'INVALID_PAYLOAD'
  | 'NOT_FOUND'
  | 'FORBIDDEN';

export interface DmError {
  code: DmErrorCode;
  message: string;
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function isValidAccountId(accountId: string): boolean {
  return accountId.length >= 2 && accountId.includes('.');
}

/** Deterministic thread id for a pair of accounts. */
export function buildDmThreadId(a: string, b: string): string {
  const left = normalizeAccountId(a);
  const right = normalizeAccountId(b);
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

function parseMediaJson(raw: string | null): DmMediaRef[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const media: DmMediaRef[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const cid = typeof row.cid === 'string' ? row.cid.trim() : '';
      const mime = typeof row.mime === 'string' ? row.mime.trim() : '';
      const nonce =
        typeof row.nonce === 'string' ? row.nonce.trim() : undefined;
      const senderNonce =
        typeof row.senderNonce === 'string'
          ? row.senderNonce.trim()
          : undefined;
      const size = typeof row.size === 'number' ? row.size : Number(row.size);
      if (!cid || !mime || !Number.isFinite(size)) continue;
      media.push({
        cid,
        mime,
        size,
        ...(nonce ? { nonce } : {}),
        ...(senderNonce ? { senderNonce } : {}),
      });
    }
    return media.length > 0 ? media : null;
  } catch {
    return null;
  }
}

interface DmStore {
  insert(message: DmMessageRecord): Promise<DmMessageRecord>;
  listThreads(accountId: string): Promise<DmThreadSummary[]>;
  listMessages(
    accountId: string,
    threadId: string,
    limit: number
  ): Promise<DmMessageRecord[]>;
  markRead(
    accountId: string,
    threadId: string,
    lastReadAt: string
  ): Promise<void>;
  getReadAt(accountId: string, threadId: string): Promise<string | null>;
}

class MemoryDmStore implements DmStore {
  private messages: DmMessageRecord[] = [];
  private reads = new Map<string, string>();

  async insert(message: DmMessageRecord): Promise<DmMessageRecord> {
    this.messages.push(message);
    return message;
  }

  async listThreads(accountId: string): Promise<DmThreadSummary[]> {
    const byThread = new Map<string, DmMessageRecord>();
    for (const msg of this.messages) {
      if (
        msg.senderAccountId !== accountId &&
        msg.recipientAccountId !== accountId
      ) {
        continue;
      }
      const prev = byThread.get(msg.threadId);
      if (!prev || prev.createdAt < msg.createdAt) {
        byThread.set(msg.threadId, msg);
      }
    }
    const threads: DmThreadSummary[] = [];
    for (const [threadId, last] of byThread) {
      const peerAccountId =
        last.senderAccountId === accountId
          ? last.recipientAccountId
          : last.senderAccountId;
      const readAt = this.reads.get(`${accountId}:${threadId}`) ?? null;
      const unread = this.messages.some(
        (msg) =>
          msg.threadId === threadId &&
          msg.recipientAccountId === accountId &&
          (readAt == null || readAt < msg.createdAt)
      );
      threads.push({
        threadId,
        peerAccountId,
        lastMessageAt: last.createdAt,
        lastMessageId: last.id,
        unread,
      });
    }
    return threads.sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt)
    );
  }

  async listMessages(
    accountId: string,
    threadId: string,
    limit: number
  ): Promise<DmMessageRecord[]> {
    return this.messages
      .filter(
        (msg) =>
          msg.threadId === threadId &&
          (msg.senderAccountId === accountId ||
            msg.recipientAccountId === accountId)
      )
      .sort((a, b) => {
        const byTime = a.createdAt.localeCompare(b.createdAt);
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      })
      .slice(-limit);
  }

  async markRead(
    accountId: string,
    threadId: string,
    lastReadAt: string
  ): Promise<void> {
    const key = `${accountId}:${threadId}`;
    const prev = this.reads.get(key);
    if (!prev || prev < lastReadAt) {
      this.reads.set(key, lastReadAt);
    }
  }

  async getReadAt(accountId: string, threadId: string): Promise<string | null> {
    return this.reads.get(`${accountId}:${threadId}`) ?? null;
  }
}

class PostgresDmStore implements DmStore {
  constructor(private readonly pool: Pool) {}

  async insert(message: DmMessageRecord): Promise<DmMessageRecord> {
    await this.pool.query(
      `INSERT INTO dm_messages (
         id, thread_id, sender_account_id, recipient_account_id,
         created_at, ciphertext, nonce, sender_ciphertext, sender_nonce,
         media_json, sender_pubkey, ephemeral_pubkey
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        message.id,
        message.threadId,
        message.senderAccountId,
        message.recipientAccountId,
        message.createdAt,
        message.ciphertext,
        message.nonce,
        message.senderCiphertext,
        message.senderNonce,
        message.media ? JSON.stringify(message.media) : null,
        message.senderPubkey,
        message.ephemeralPubkey,
      ]
    );
    return message;
  }

  async listThreads(accountId: string): Promise<DmThreadSummary[]> {
    const result = await this.pool.query<{
      thread_id: string;
      sender_account_id: string;
      recipient_account_id: string;
      created_at: Date;
      id: string;
      last_read_at: Date | null;
      unread: boolean;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (thread_id)
           thread_id, sender_account_id, recipient_account_id, created_at, id
         FROM dm_messages
         WHERE sender_account_id = $1 OR recipient_account_id = $1
         ORDER BY thread_id, created_at DESC
       ),
       unread AS (
         SELECT m.thread_id
         FROM dm_messages m
         LEFT JOIN dm_thread_reads r
           ON r.thread_id = m.thread_id AND r.account_id = $1
         WHERE (m.sender_account_id = $1 OR m.recipient_account_id = $1)
           AND m.recipient_account_id = $1
           AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
         GROUP BY m.thread_id
       )
       SELECT l.*, r.last_read_at, (u.thread_id IS NOT NULL) AS unread
       FROM latest l
       LEFT JOIN dm_thread_reads r
         ON r.thread_id = l.thread_id AND r.account_id = $1
       LEFT JOIN unread u ON u.thread_id = l.thread_id
       ORDER BY l.created_at DESC`,
      [accountId]
    );

    return result.rows.map((row) => {
      const lastMessageAt = new Date(row.created_at).toISOString();
      const peerAccountId =
        row.sender_account_id === accountId
          ? row.recipient_account_id
          : row.sender_account_id;
      return {
        threadId: row.thread_id,
        peerAccountId,
        lastMessageAt,
        lastMessageId: row.id,
        unread: Boolean(row.unread),
      };
    });
  }

  async listMessages(
    accountId: string,
    threadId: string,
    limit: number
  ): Promise<DmMessageRecord[]> {
    // Newest page first, then flip ascending for UI (matches MemoryDmStore).
    const result = await this.pool.query<{
      id: string;
      thread_id: string;
      sender_account_id: string;
      recipient_account_id: string;
      created_at: Date;
      ciphertext: string;
      nonce: string;
      sender_ciphertext: string | null;
      sender_nonce: string | null;
      media_json: string | null;
      sender_pubkey: string;
      ephemeral_pubkey: string | null;
    }>(
      `WITH page AS (
         SELECT *
         FROM dm_messages
         WHERE thread_id = $1
           AND (sender_account_id = $2 OR recipient_account_id = $2)
         ORDER BY created_at DESC, id DESC
         LIMIT $3
       )
       SELECT * FROM page
       ORDER BY created_at ASC, id ASC`,
      [threadId, accountId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      senderAccountId: row.sender_account_id,
      recipientAccountId: row.recipient_account_id,
      createdAt: new Date(row.created_at).toISOString(),
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      senderCiphertext: row.sender_ciphertext,
      senderNonce: row.sender_nonce,
      media: parseMediaJson(row.media_json),
      senderPubkey: row.sender_pubkey,
      ephemeralPubkey: row.ephemeral_pubkey ?? null,
    }));
  }

  async markRead(
    accountId: string,
    threadId: string,
    lastReadAt: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO dm_thread_reads (account_id, thread_id, last_read_at)
       VALUES ($1, $2, $3::timestamptz)
       ON CONFLICT (account_id, thread_id)
       DO UPDATE SET last_read_at = GREATEST(
         dm_thread_reads.last_read_at,
         EXCLUDED.last_read_at
       )`,
      [accountId, threadId, lastReadAt]
    );
  }

  async getReadAt(accountId: string, threadId: string): Promise<string | null> {
    const result = await this.pool.query<{ last_read_at: Date }>(
      `SELECT last_read_at FROM dm_thread_reads
       WHERE account_id = $1 AND thread_id = $2`,
      [accountId, threadId]
    );
    const row = result.rows[0];
    return row ? new Date(row.last_read_at).toISOString() : null;
  }
}

const databaseUrl = process.env.DATABASE_URL;
const allowMemoryStore =
  process.env.NODE_ENV !== 'production' ||
  process.env.DM_ALLOW_MEMORY_STORE === '1';

if (!databaseUrl && !allowMemoryStore) {
  throw new Error(
    'FATAL: DATABASE_URL is required for the DM mailbox in production'
  );
}

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const store: DmStore = pool ? new PostgresDmStore(pool) : new MemoryDmStore();

if (databaseUrl) {
  logger.info('DM mailbox store: PostgreSQL');
} else {
  logger.info('DM mailbox store: in-memory');
}

/** Metadata-only DM ping — never includes ciphertext. */
async function emitDmReceivedNotification(
  message: DmMessageRecord
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO notifications (
         owner_account_id, app_id, recipient, actor, notification_type,
         source_contract, source_receipt_id, source_block_height,
         dedupe_key, context, created_at
       ) VALUES (
         $1, 'default', $2, $3, 'dm',
         'dm', NULL, NULL,
         $4, $5::jsonb, $6
       )
       ON CONFLICT (owner_account_id, app_id, dedupe_key) DO NOTHING`,
      [
        message.recipientAccountId,
        message.recipientAccountId,
        message.senderAccountId,
        `dm:${message.id}`,
        JSON.stringify({
          threadId: message.threadId,
          peerAccountId: message.senderAccountId,
        }),
        message.createdAt,
      ]
    );
  } catch (error) {
    logger.warn({ error }, 'Failed to emit DM notification');
  }
}

function validateCipherFields(input: {
  ciphertext?: string;
  nonce?: string;
  senderPubkey?: string;
}): DmError | null {
  const ciphertext = input.ciphertext?.trim() ?? '';
  const nonce = input.nonce?.trim() ?? '';
  const senderPubkey = input.senderPubkey?.trim() ?? '';
  if (!ciphertext || ciphertext.length > 200_000) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'ciphertext is required and must be under 200KB',
    };
  }
  if (!nonce || nonce.length > 128) {
    return { code: 'INVALID_PAYLOAD', message: 'nonce is required' };
  }
  if (!senderPubkey || senderPubkey.length > 128) {
    return { code: 'INVALID_PAYLOAD', message: 'senderPubkey is required' };
  }
  return null;
}

export async function sendDmMessage(
  input: DmSendInput
): Promise<DmMessageRecord | DmError> {
  const sender = normalizeAccountId(input.senderAccountId);
  const recipient = normalizeAccountId(input.recipientAccountId);
  if (!isValidAccountId(sender) || !isValidAccountId(recipient)) {
    return { code: 'INVALID_ACCOUNT', message: 'Invalid account id' };
  }
  if (sender === recipient) {
    return { code: 'SELF_MESSAGE', message: 'Cannot message yourself' };
  }
  const payloadError = validateCipherFields(input);
  if (payloadError) return payloadError;

  const blockCheck = await checkBlockEitherWay(sender, recipient);
  if (!blockCheck.ok) {
    return {
      code: 'UNAVAILABLE',
      message: 'Could not verify messaging permission. Try again.',
    };
  }
  if (blockCheck.blocked) {
    return {
      code: 'BLOCKED',
      message: 'Messaging is unavailable while a block is in place.',
    };
  }

  if (await hasMute(recipient, sender)) {
    return {
      code: 'MUTED',
      message: 'Recipient is not accepting messages from you',
    };
  }
  if (await hasMute(sender, recipient)) {
    return {
      code: 'MUTED',
      message: 'Unmute this account before messaging',
    };
  }

  const media = Array.isArray(input.media) ? input.media.slice(0, 8) : null;
  const message: DmMessageRecord = {
    id: randomUUID(),
    threadId: buildDmThreadId(sender, recipient),
    senderAccountId: sender,
    recipientAccountId: recipient,
    createdAt: new Date().toISOString(),
    ciphertext: input.ciphertext.trim(),
    nonce: input.nonce.trim(),
    senderCiphertext: input.senderCiphertext?.trim() || null,
    senderNonce: input.senderNonce?.trim() || null,
    media,
    senderPubkey: input.senderPubkey.trim(),
    ephemeralPubkey: input.ephemeralPubkey?.trim() || null,
  };
  const inserted = await store.insert(message);
  void emitDmReceivedNotification(inserted);
  return inserted;
}

export async function listDmThreads(
  accountId: string
): Promise<DmThreadSummary[] | DmError> {
  const id = normalizeAccountId(accountId);
  if (!isValidAccountId(id)) {
    return { code: 'INVALID_ACCOUNT', message: 'Invalid account id' };
  }
  return store.listThreads(id);
}

/** Count unread threads for the viewer (mailbox metadata only). */
export async function countUnreadDmThreads(
  accountId: string
): Promise<number | DmError> {
  const threads = await listDmThreads(accountId);
  if ('code' in threads) return threads;
  return threads.filter((thread) => thread.unread).length;
}

export async function listDmMessages(
  accountId: string,
  threadId: string,
  limit = 100
): Promise<DmMessageRecord[] | DmError> {
  const id = normalizeAccountId(accountId);
  const thread = threadId.trim();
  if (!isValidAccountId(id)) {
    return { code: 'INVALID_ACCOUNT', message: 'Invalid account id' };
  }
  if (!thread || !thread.includes('::')) {
    return { code: 'NOT_FOUND', message: 'Thread not found' };
  }
  const [a, b] = thread.split('::');
  if (id !== a && id !== b) {
    return { code: 'FORBIDDEN', message: 'Not a participant in this thread' };
  }
  const capped = Math.min(Math.max(limit, 1), 200);
  return store.listMessages(id, thread, capped);
}

export async function markDmThreadRead(
  accountId: string,
  threadId: string,
  opts?: { lastReadAt?: string | null; lastReadMessageId?: string | null }
): Promise<true | DmError> {
  const id = normalizeAccountId(accountId);
  const thread = threadId.trim();
  if (!isValidAccountId(id)) {
    return { code: 'INVALID_ACCOUNT', message: 'Invalid account id' };
  }
  if (!thread.includes('::')) {
    return { code: 'NOT_FOUND', message: 'Thread not found' };
  }
  const [a, b] = thread.split('::');
  if (id !== a && id !== b) {
    return { code: 'FORBIDDEN', message: 'Not a participant in this thread' };
  }

  let lastReadAt = opts?.lastReadAt?.trim() || '';
  const messageId = opts?.lastReadMessageId?.trim() || '';
  if (!lastReadAt && messageId) {
    const messages = await store.listMessages(id, thread, 200);
    const match = messages.find((msg) => msg.id === messageId);
    if (!match) {
      return { code: 'NOT_FOUND', message: 'Message not found in thread' };
    }
    lastReadAt = match.createdAt;
  }
  if (!lastReadAt) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'lastReadAt or lastReadMessageId is required',
    };
  }
  const parsed = Date.parse(lastReadAt);
  if (!Number.isFinite(parsed)) {
    return { code: 'INVALID_PAYLOAD', message: 'Invalid lastReadAt' };
  }

  await store.markRead(id, thread, new Date(parsed).toISOString());
  return true;
}

/** Test helper — reset in-memory store between unit tests. */
export function __resetDmStoreForTests(): void {
  if (databaseUrl) return;
  (store as MemoryDmStore)['messages'] = [];
  (store as MemoryDmStore)['reads'] = new Map();
}
