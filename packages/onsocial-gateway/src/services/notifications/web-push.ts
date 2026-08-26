/**
 * Web Push subscriptions + delivery for first-party Activity.
 *
 * Storage is PostgreSQL when DATABASE_URL is set (same DB as notifications).
 * Delivery is driven by LISTEN `notification_push` in the notification worker
 * so worker, DM, and DAO inserts all fan out without sharing TS helpers.
 */

import { Pool } from 'pg';
import webpush from 'web-push';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

export interface PushSubscriptionRecord {
  id: string;
  ownerAccountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface PushStatus {
  configured: boolean;
  enabled: boolean;
  subscriptionCount: number;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  notificationId: string;
}

export interface PushError {
  code: 'NOT_CONFIGURED' | 'INVALID_SUBSCRIPTION' | 'NOT_FOUND';
  message: string;
}

type NotificationRow = {
  id: string;
  recipient: string;
  actor: string;
  notification_type: string;
  context: Record<string, unknown> | null;
};

interface PushSubscriptionStore {
  upsert(
    ownerAccountId: string,
    input: PushSubscriptionInput
  ): Promise<PushSubscriptionRecord>;
  listEnabled(ownerAccountId: string): Promise<PushSubscriptionRecord[]>;
  setEnabled(ownerAccountId: string, enabled: boolean): Promise<number>;
  remove(ownerAccountId: string, endpoint: string): Promise<boolean>;
  status(ownerAccountId: string): Promise<{
    enabled: boolean;
    subscriptionCount: number;
  }>;
  removeByEndpoint(endpoint: string): Promise<void>;
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function isValidEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidKey(value: string): boolean {
  return value.trim().length >= 8;
}

class MemoryPushStore implements PushSubscriptionStore {
  private rows = new Map<string, Map<string, PushSubscriptionRecord>>();

  private bucket(ownerAccountId: string): Map<string, PushSubscriptionRecord> {
    let map = this.rows.get(ownerAccountId);
    if (!map) {
      map = new Map();
      this.rows.set(ownerAccountId, map);
    }
    return map;
  }

  async upsert(
    ownerAccountId: string,
    input: PushSubscriptionInput
  ): Promise<PushSubscriptionRecord> {
    const now = new Date().toISOString();
    const existing = this.bucket(ownerAccountId).get(input.endpoint);
    const record: PushSubscriptionRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      ownerAccountId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      enabled: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.bucket(ownerAccountId).set(input.endpoint, record);
    return record;
  }

  async listEnabled(ownerAccountId: string): Promise<PushSubscriptionRecord[]> {
    return Array.from(this.bucket(ownerAccountId).values()).filter(
      (row) => row.enabled
    );
  }

  async setEnabled(ownerAccountId: string, enabled: boolean): Promise<number> {
    let updated = 0;
    for (const row of this.bucket(ownerAccountId).values()) {
      row.enabled = enabled;
      row.updatedAt = new Date().toISOString();
      updated += 1;
    }
    return updated;
  }

  async remove(ownerAccountId: string, endpoint: string): Promise<boolean> {
    return this.bucket(ownerAccountId).delete(endpoint);
  }

  async status(ownerAccountId: string): Promise<{
    enabled: boolean;
    subscriptionCount: number;
  }> {
    const rows = Array.from(this.bucket(ownerAccountId).values());
    const enabledRows = rows.filter((row) => row.enabled);
    return {
      enabled: enabledRows.length > 0,
      subscriptionCount: enabledRows.length,
    };
  }

  async removeByEndpoint(endpoint: string): Promise<void> {
    for (const bucket of this.rows.values()) {
      bucket.delete(endpoint);
    }
  }
}

class PostgresPushStore implements PushSubscriptionStore {
  constructor(private readonly pool: Pool) {}

  async upsert(
    ownerAccountId: string,
    input: PushSubscriptionInput
  ): Promise<PushSubscriptionRecord> {
    const result = await this.pool.query<{
      id: string;
      owner_account_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_agent: string | null;
      enabled: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO push_subscriptions (
         owner_account_id, endpoint, p256dh, auth, user_agent, enabled
       ) VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (owner_account_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
         enabled = TRUE,
         updated_at = NOW()
       RETURNING *`,
      [
        ownerAccountId,
        input.endpoint,
        input.p256dh,
        input.auth,
        input.userAgent ?? null,
      ]
    );
    return mapRow(result.rows[0]!);
  }

  async listEnabled(ownerAccountId: string): Promise<PushSubscriptionRecord[]> {
    const result = await this.pool.query<{
      id: string;
      owner_account_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_agent: string | null;
      enabled: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM push_subscriptions
       WHERE owner_account_id = $1 AND enabled = TRUE`,
      [ownerAccountId]
    );
    return result.rows.map(mapRow);
  }

  async setEnabled(ownerAccountId: string, enabled: boolean): Promise<number> {
    const result = await this.pool.query(
      `UPDATE push_subscriptions
       SET enabled = $2, updated_at = NOW()
       WHERE owner_account_id = $1`,
      [ownerAccountId, enabled]
    );
    return result.rowCount ?? 0;
  }

  async remove(ownerAccountId: string, endpoint: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM push_subscriptions
       WHERE owner_account_id = $1 AND endpoint = $2`,
      [ownerAccountId, endpoint]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async status(ownerAccountId: string): Promise<{
    enabled: boolean;
    subscriptionCount: number;
  }> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM push_subscriptions
       WHERE owner_account_id = $1 AND enabled = TRUE`,
      [ownerAccountId]
    );
    const count = Number.parseInt(result.rows[0]?.count ?? '0', 10) || 0;
    return { enabled: count > 0, subscriptionCount: count };
  }

  async removeByEndpoint(endpoint: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]
    );
  }
}

function mapRow(row: {
  id: string;
  owner_account_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): PushSubscriptionRecord {
  return {
    id: row.id,
    ownerAccountId: row.owner_account_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    enabled: row.enabled,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : row.created_at.toISOString(),
    updatedAt:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : row.updated_at.toISOString(),
  };
}

const databaseUrl = process.env.DATABASE_URL;
const allowMemoryStore =
  process.env.NODE_ENV !== 'production' ||
  process.env.PUSH_ALLOW_MEMORY_STORE === '1';

if (!databaseUrl && !allowMemoryStore) {
  throw new Error(
    'FATAL: DATABASE_URL is required for Web Push subscriptions in production'
  );
}

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const store: PushSubscriptionStore = pool
  ? new PostgresPushStore(pool)
  : new MemoryPushStore();

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = config.vapidPublicKey;
  const privateKey = config.vapidPrivateKey;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(config.vapidSubject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function getVapidPublicKey(): string | null {
  return config.vapidPublicKey || null;
}

function textField(
  context: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = context?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberField(
  context: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = context?.[key];
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

/** Compact verb for OS notification body (mirrors app Activity copy). */
export function pushNotificationVerb(
  type: string,
  _context?: Record<string, unknown> | null
): string {
  switch (type) {
    case 'reply':
      return 'replied to your post';
    case 'quote':
      return 'quoted your post';
    case 'repost':
      return 'reposted your post';
    case 'reaction':
      return 'reacted to your post';
    case 'mention':
      return 'mentioned you';
    case 'standing_new':
      return 'stood with you';
    case 'dm':
      return 'sent a private message';
    case 'group_invite':
      return 'invited you';
    case 'group_proposal':
      return 'opened a proposal';
    case 'dao_proposal':
      return 'opened a proposal';
    case 'dao_proposal_resolved': {
      const status = textField(_context, 'status');
      switch ((status ?? '').trim()) {
        case 'Approved':
          return 'Proposal approved';
        case 'Rejected':
          return 'Proposal rejected';
        case 'Removed':
          return 'Proposal removed';
        case 'Expired':
          return 'Proposal expired';
        case 'Failed':
          return 'Proposal failed';
        case 'Moved':
          return 'Proposal moved';
        default:
          return 'Proposal resolved';
      }
    }
    case 'dao_proposal_vote':
      return 'voted on your proposal';
    case 'scarces_sold':
      return 'bought this';
    case 'scarces_offer':
      return 'made an offer';
    case 'reward_credited':
      return 'SOCIAL credited';
    case 'reward_claimed':
      return 'SOCIAL collected';
    case 'boost_locked':
      return 'your boost is locked';
    case 'boost_extended':
      return 'your boost was extended';
    case 'boost_unlocked':
      return 'your boost unlocked';
    case 'boost_reward_claimed':
      return 'boost collected';
    case 'boost_credits_purchased':
      return 'credits bought';
    case 'boost_storage_deposited':
      return 'storage deposited';
    case 'app_event':
      return 'app update';
    case 'profile_anniversary': {
      const years = numberField(_context, 'years');
      if (years === 1) return '1 year on OnSocial';
      if (years != null && years > 1) return `${years} years on OnSocial`;
      return 'anniversary on OnSocial';
    }
    default:
      if (type.startsWith('boost_')) return 'boost update';
      return 'new activity';
  }
}

/** Deep link path for notification click (app-relative). */
export function pushNotificationUrl(row: {
  notification_type: string;
  actor: string;
  recipient?: string;
  context: Record<string, unknown> | null;
}): string {
  const type = row.notification_type;
  const context = row.context;
  const actor = row.actor?.trim() || null;

  if (type === 'dm') {
    const threadId = textField(context, 'threadId');
    const peer =
      textField(context, 'peerAccountId') ??
      textField(context, 'peer') ??
      actor;
    if (threadId) {
      return `/messages?thread=${encodeURIComponent(threadId)}`;
    }
    if (peer) {
      return `/messages?peer=${encodeURIComponent(peer)}`;
    }
    return '/messages';
  }

  if (
    type === 'dao_proposal' ||
    type === 'dao_proposal_resolved' ||
    type === 'dao_proposal_vote'
  ) {
    const daoAccountId = textField(context, 'daoAccountId');
    if (daoAccountId) {
      const proposalId = numberField(context, 'proposalId');
      const qs = new URLSearchParams();
      if (proposalId != null) qs.set('proposal', String(proposalId));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return `/@${encodeURIComponent(daoAccountId)}${suffix}`;
    }
  }

  if (type === 'group_invite' || type === 'group_proposal') {
    const groupId = textField(context, 'groupId');
    if (groupId) {
      return type === 'group_proposal'
        ? `/groups/${encodeURIComponent(groupId)}?sheet=proposals`
        : `/groups/${encodeURIComponent(groupId)}`;
    }
    return '/groups';
  }

  if (type === 'profile_anniversary') {
    const accountId =
      textField(context, 'accountId') ?? (row.recipient?.trim() || null);
    if (accountId) {
      return `/@${encodeURIComponent(accountId)}`;
    }
    return '/notifications';
  }

  if (type === 'scarces_sold' || type === 'scarces_offer') {
    const collectionId = textField(context, 'collectionId');
    if (collectionId) {
      return `/collection/${encodeURIComponent(collectionId)}`;
    }
  }

  if (type.startsWith('boost_')) {
    const recipient = row.recipient?.trim();
    if (recipient) {
      return `/@${encodeURIComponent(recipient)}?sheet=boost`;
    }
    return '/home';
  }

  if (type.startsWith('reward_')) {
    return '/home?sheet=wallet';
  }

  if (
    type === 'reply' ||
    type === 'quote' ||
    type === 'repost' ||
    type === 'mention' ||
    type === 'reaction'
  ) {
    const groupId = textField(context, 'groupId');
    const fromPath =
      parsePushPostPath(textField(context, 'parentPath')) ??
      parsePushPostPath(textField(context, 'refPath')) ??
      parsePushPostPath(textField(context, 'reactionTargetPath')) ??
      parsePushPostPath(textField(context, 'path'));
    const postId = fromPath?.postId ?? textField(context, 'postId');
    const author = fromPath?.author ?? actor;
    if (author && postId) {
      if (groupId) {
        return `/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(author)}/${encodeURIComponent(postId)}`;
      }
      return `/@${encodeURIComponent(author)}/posts/${encodeURIComponent(postId)}`;
    }
  }

  if (actor) {
    return `/@${encodeURIComponent(actor)}`;
  }

  return '/notifications';
}

function parsePushPostPath(
  path: string | null
): { author: string; postId: string } | null {
  if (!path) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

export function buildWebPushPayload(row: NotificationRow): WebPushPayload {
  const type = row.notification_type;
  const body = pushNotificationVerb(type, row.context);
  if (type === 'profile_anniversary') {
    return {
      title: 'OnSocial',
      body,
      url: pushNotificationUrl(row),
      tag: `onsocial-notif-${row.id}`,
      notificationId: row.id,
    };
  }
  if (type.startsWith('reward_')) {
    return {
      title: 'Collect',
      body,
      url: pushNotificationUrl(row),
      tag: `onsocial-notif-${row.id}`,
      notificationId: row.id,
    };
  }
  if (type.startsWith('boost_')) {
    return {
      title: 'Boost',
      body,
      url: pushNotificationUrl(row),
      tag: `onsocial-notif-${row.id}`,
      notificationId: row.id,
    };
  }
  const actor = row.actor?.trim() || 'Someone';
  return {
    title: actor,
    body,
    url: pushNotificationUrl(row),
    tag: `onsocial-notif-${row.id}`,
    notificationId: row.id,
  };
}

export async function upsertPushSubscription(
  ownerAccountId: string,
  input: PushSubscriptionInput
): Promise<PushSubscriptionRecord | PushError> {
  if (!isWebPushConfigured()) {
    return {
      code: 'NOT_CONFIGURED',
      message: 'Web Push is not configured on this gateway',
    };
  }
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!isValidEndpoint(endpoint) || !isValidKey(p256dh) || !isValidKey(auth)) {
    return {
      code: 'INVALID_SUBSCRIPTION',
      message: 'endpoint, p256dh, and auth are required',
    };
  }
  return store.upsert(normalizeAccountId(ownerAccountId), {
    endpoint,
    p256dh,
    auth,
    userAgent: input.userAgent ?? null,
  });
}

export async function removePushSubscription(
  ownerAccountId: string,
  endpoint: string
): Promise<true | PushError> {
  const removed = await store.remove(
    normalizeAccountId(ownerAccountId),
    endpoint.trim()
  );
  if (!removed) {
    return { code: 'NOT_FOUND', message: 'Subscription not found' };
  }
  return true;
}

export async function setPushEnabled(
  ownerAccountId: string,
  enabled: boolean
): Promise<number> {
  return store.setEnabled(normalizeAccountId(ownerAccountId), enabled);
}

export async function getPushStatus(
  ownerAccountId: string
): Promise<PushStatus> {
  const status = await store.status(normalizeAccountId(ownerAccountId));
  return {
    configured: isWebPushConfigured(),
    enabled: status.enabled,
    subscriptionCount: status.subscriptionCount,
  };
}

async function loadNotification(
  notificationId: string
): Promise<NotificationRow | null> {
  if (!pool) return null;
  const result = await pool.query<NotificationRow>(
    `SELECT id, recipient, actor, notification_type, context
     FROM notifications
     WHERE id = $1`,
    [notificationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    context:
      row.context && typeof row.context === 'object'
        ? (row.context as Record<string, unknown>)
        : {},
  };
}

/**
 * Deliver OS push for one notification id. Safe to call fire-and-forget;
 * no-ops when VAPID is unset or the recipient has no enabled subscriptions.
 */
export async function deliverWebPushForNotificationId(
  notificationId: string
): Promise<void> {
  if (!ensureVapid()) return;

  const row = await loadNotification(notificationId);
  if (!row) return;

  const subscriptions = await store.listEnabled(
    normalizeAccountId(row.recipient)
  );
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify(buildWebPushPayload(row));

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 60 * 60 * 12,
            urgency: 'normal',
          }
        );
      } catch (error) {
        const statusCode =
          error &&
          typeof error === 'object' &&
          'statusCode' in error &&
          typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : null;
        // Gone / unsubscribed — drop the endpoint.
        if (statusCode === 404 || statusCode === 410) {
          await store.removeByEndpoint(subscription.endpoint).catch(() => {});
          logger.info(
            { endpoint: subscription.endpoint.slice(0, 64) },
            'Removed stale Web Push subscription'
          );
          return;
        }
        logger.warn(
          { error, notificationId, recipient: row.recipient },
          'Web Push delivery failed'
        );
      }
    })
  );
}
