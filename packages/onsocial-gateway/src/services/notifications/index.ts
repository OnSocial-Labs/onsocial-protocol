import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';

export const NOTIFICATION_TYPES = [
  'reply',
  'quote',
  'reaction',
  'mention',
  'standing_new',
  'reward_credited',
  'reward_claimed',
  'boost_locked',
  'boost_extended',
  'boost_unlocked',
  'boost_reward_claimed',
  'boost_credits_purchased',
  'boost_storage_deposited',
  'scarces_sold',
  'scarces_offer',
  'group_proposal',
  'group_invite',
  'dao_proposal',
  'dao_proposal_resolved',
  'dao_proposal_vote',
  'app_event',
  'dm',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRecord {
  id: string;
  recipient: string;
  actor: string;
  type: string;
  createdAt: string;
  read: boolean;
  source: {
    contract: string;
    receiptId: string | null;
    blockHeight: number | null;
  };
  context: Record<string, unknown>;
}

export interface NotificationListResult {
  notifications: NotificationRecord[];
  nextCursor: string | null;
}

interface NotificationListParams {
  ownerAccountId: string;
  appId: string;
  recipient: string;
  limit: number;
  read?: boolean;
  type?: string;
  eventType?: string;
  cursor?: string;
  /** Omit a kind from the list (e.g. `dm` when Messages owns that surface). */
  excludeType?: string;
}

interface NotificationStore {
  list(params: NotificationListParams): Promise<NotificationListResult>;
  countUnread(
    ownerAccountId: string,
    appId: string,
    recipient: string,
    eventType?: string,
    excludeType?: string
  ): Promise<number>;
  markRead(params: {
    ownerAccountId: string;
    appId: string;
    recipient: string;
    ids?: string[];
    all?: boolean;
    /** When set with type, mark matching unread rows (e.g. DM thread context). */
    type?: string;
    contextContains?: Record<string, unknown>;
    /** When set with `all`, leave this kind unread (e.g. Activity mark-all skips `dm`). */
    excludeType?: string;
  }): Promise<number>;
}

class MemoryNotificationStore implements NotificationStore {
  private notifications: Array<{
    ownerAccountId: string;
    appId: string;
    id: string;
    recipient: string;
    actor: string;
    type: string;
    createdAt: string;
    read: boolean;
    sourceContract: string;
    sourceReceiptId: string | null;
    sourceBlockHeight: number | null;
    context: Record<string, unknown>;
  }> = [];

  async list(params: NotificationListParams): Promise<NotificationListResult> {
    const exclude = params.excludeType?.trim() || undefined;
    const filtered = this.notifications
      .filter((item) => item.ownerAccountId === params.ownerAccountId)
      .filter((item) => item.appId === params.appId)
      .filter((item) => item.recipient === params.recipient)
      .filter((item) => params.read === undefined || item.read === params.read)
      .filter((item) => !params.type || item.type === params.type)
      .filter((item) => !exclude || item.type !== exclude)
      .filter(
        (item) =>
          !params.eventType || item.context.eventType === params.eventType
      )
      .filter((item) => !params.cursor || item.createdAt < params.cursor)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const slice = filtered.slice(0, params.limit);
    return {
      notifications: slice.map((item) => ({
        id: item.id,
        recipient: item.recipient,
        actor: item.actor,
        type: item.type,
        createdAt: item.createdAt,
        read: item.read,
        source: {
          contract: item.sourceContract,
          receiptId: item.sourceReceiptId,
          blockHeight: item.sourceBlockHeight,
        },
        context: item.context,
      })),
      nextCursor:
        slice.length === params.limit
          ? (slice.at(-1)?.createdAt ?? null)
          : null,
    };
  }

  async countUnread(
    ownerAccountId: string,
    appId: string,
    recipient: string,
    eventType?: string,
    excludeType?: string
  ): Promise<number> {
    return this.notifications.filter(
      (item) =>
        item.ownerAccountId === ownerAccountId &&
        item.appId === appId &&
        item.recipient === recipient &&
        (!eventType || item.context.eventType === eventType) &&
        (!excludeType || item.type !== excludeType) &&
        !item.read
    ).length;
  }

  async markRead(params: {
    ownerAccountId: string;
    appId: string;
    recipient: string;
    ids?: string[];
    all?: boolean;
    type?: string;
    contextContains?: Record<string, unknown>;
    excludeType?: string;
  }): Promise<number> {
    const exclude = params.excludeType?.trim() || undefined;
    let updated = 0;
    for (const item of this.notifications) {
      const matchesScope =
        item.ownerAccountId === params.ownerAccountId &&
        item.appId === params.appId &&
        item.recipient === params.recipient &&
        !item.read;
      const matchesType = !params.type || item.type === params.type;
      const matchesExclude = !exclude || item.type !== exclude;
      const matchesContext =
        !params.contextContains ||
        Object.entries(params.contextContains).every(
          ([key, value]) => item.context?.[key] === value
        );
      const matchesSelection =
        params.all ||
        (params.ids?.includes(item.id) ?? false) ||
        (Boolean(params.type) && matchesType && matchesContext);

      if (
        matchesScope &&
        matchesType &&
        matchesExclude &&
        matchesContext &&
        matchesSelection
      ) {
        item.read = true;
        updated++;
      }
    }

    return updated;
  }
}

class HasuraNotificationStore implements NotificationStore {
  constructor(
    private readonly url: string,
    private readonly secret: string
  ) {}

  private async gql<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': this.secret,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(`Hasura notifications: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  async list(params: NotificationListParams): Promise<NotificationListResult> {
    const eventTypeFilter = normalizeEventType(params.eventType);
    const exclude = params.excludeType?.trim() || undefined;
    const whereFields = [
      'ownerAccountId: { _eq: $owner }',
      'appId: { _eq: $app }',
      'recipient: { _eq: $recipient }',
      'createdAt: { _lt: $cursor }',
    ];

    if (params.read !== undefined) {
      whereFields.push('read: { _eq: $read }');
    }
    if (params.type) {
      whereFields.push('notificationType: { _eq: $type }');
    }
    if (exclude) {
      whereFields.push('notificationType: { _neq: $excludeType }');
    }

    if (eventTypeFilter) {
      whereFields.push('context: { _contains: $eventContext }');
    }

    const varDecls = [
      '$owner: String!',
      '$app: String!',
      '$recipient: String!',
      '$limit: Int!',
      '$cursor: timestamptz!',
    ];
    if (params.read !== undefined) varDecls.push('$read: Boolean');
    if (params.type) varDecls.push('$type: String');
    if (exclude) varDecls.push('$excludeType: String!');
    if (eventTypeFilter) varDecls.push('$eventContext: jsonb');

    const result = await this.gql<{
      notifications: Array<{
        id: string;
        recipient: string;
        actor: string;
        notificationType: string;
        createdAt: string;
        read: boolean;
        sourceContract: string;
        sourceReceiptId: string | null;
        sourceBlockHeight: number | null;
        dedupeKey: string | null;
        context: Record<string, unknown>;
      }>;
    }>(
      `query(${varDecls.join(', ')}) {
        notifications(
          where: {
            ${whereFields.join('\n            ')}
          }
          orderBy: [{ createdAt: DESC }, { id: DESC }]
          limit: $limit
        ) {
          id
          recipient
          actor
          notificationType
          createdAt
          read
          sourceContract
          sourceReceiptId
          sourceBlockHeight
          dedupeKey
          context
        }
      }`,
      {
        owner: params.ownerAccountId,
        app: params.appId,
        recipient: params.recipient,
        limit: params.limit,
        cursor: params.cursor ?? '9999-12-31T23:59:59.999Z',
        ...(params.read !== undefined ? { read: params.read } : {}),
        ...(params.type ? { type: params.type } : {}),
        ...(exclude ? { excludeType: exclude } : {}),
        ...(eventTypeFilter
          ? { eventContext: { eventType: eventTypeFilter } }
          : {}),
      }
    );

    const notifications = result.notifications.map((row) => ({
      id: row.id,
      recipient: row.recipient,
      actor: row.actor,
      type: row.notificationType,
      createdAt: row.createdAt,
      read: row.read,
      dedupeKey: row.dedupeKey,
      source: {
        contract: row.sourceContract,
        receiptId: row.sourceReceiptId,
        blockHeight: row.sourceBlockHeight,
      },
      context: row.context,
    }));

    return {
      notifications,
      nextCursor:
        notifications.length === params.limit
          ? (notifications.at(-1)?.createdAt ?? null)
          : null,
    };
  }

  async countUnread(
    ownerAccountId: string,
    appId: string,
    recipient: string,
    eventType?: string,
    excludeType?: string
  ): Promise<number> {
    const eventTypeFilter = normalizeEventType(eventType);
    const exclude = excludeType?.trim() || undefined;
    const whereFields = [
      'ownerAccountId: { _eq: $owner }',
      'appId: { _eq: $app }',
      'recipient: { _eq: $recipient }',
      'read: { _eq: false }',
    ];

    if (eventTypeFilter) {
      whereFields.push('context: { _contains: $eventContext }');
    }
    if (exclude) {
      whereFields.push('notificationType: { _neq: $excludeType }');
    }

    const countVarDecls = [
      '$owner: String!',
      '$app: String!',
      '$recipient: String!',
    ];
    if (eventTypeFilter) countVarDecls.push('$eventContext: jsonb');
    if (exclude) countVarDecls.push('$excludeType: String!');

    const result = await this.gql<{
      notificationsAggregate: { aggregate: { count: number } };
    }>(
      `query(${countVarDecls.join(', ')}) {
        notificationsAggregate(
          where: {
            ${whereFields.join('\n            ')}
          }
        ) {
          aggregate { count }
        }
      }`,
      {
        owner: ownerAccountId,
        app: appId,
        recipient,
        ...(eventTypeFilter
          ? { eventContext: { eventType: eventTypeFilter } }
          : {}),
        ...(exclude ? { excludeType: exclude } : {}),
      }
    );

    return result.notificationsAggregate.aggregate.count;
  }

  async markRead(params: {
    ownerAccountId: string;
    appId: string;
    recipient: string;
    ids?: string[];
    all?: boolean;
    type?: string;
    contextContains?: Record<string, unknown>;
    excludeType?: string;
  }): Promise<number> {
    if (params.type && params.contextContains && !params.all && !params.ids) {
      const result = await this.gql<{
        updateNotifications: { affectedRows: number };
      }>(
        `mutation(
          $owner: String!,
          $app: String!,
          $recipient: String!,
          $type: String!,
          $context: jsonb!,
          $readAt: timestamptz!
        ) {
          updateNotifications(
            where: {
              ownerAccountId: { _eq: $owner }
              appId: { _eq: $app }
              recipient: { _eq: $recipient }
              notificationType: { _eq: $type }
              read: { _eq: false }
              context: { _contains: $context }
            }
            _set: { read: true, readAt: $readAt }
          ) {
            affectedRows
          }
        }`,
        {
          owner: params.ownerAccountId,
          app: params.appId,
          recipient: params.recipient,
          type: params.type,
          context: params.contextContains,
          readAt: new Date().toISOString(),
        }
      );
      return result.updateNotifications.affectedRows;
    }

    const exclude = params.excludeType?.trim() || undefined;
    const mutation =
      params.all && exclude
        ? `mutation($owner: String!, $app: String!, $recipient: String!, $excludeType: String!, $readAt: timestamptz!) {
          updateNotifications(
            where: {
              ownerAccountId: { _eq: $owner }
              appId: { _eq: $app }
              recipient: { _eq: $recipient }
              read: { _eq: false }
              notificationType: { _neq: $excludeType }
            }
            _set: { read: true, readAt: $readAt }
          ) {
            affectedRows
          }
        }`
        : params.all
          ? `mutation($owner: String!, $app: String!, $recipient: String!, $readAt: timestamptz!) {
          updateNotifications(
            where: {
              ownerAccountId: { _eq: $owner }
              appId: { _eq: $app }
              recipient: { _eq: $recipient }
              read: { _eq: false }
            }
            _set: { read: true, readAt: $readAt }
          ) {
            affectedRows
          }
        }`
          : `mutation($owner: String!, $app: String!, $recipient: String!, $ids: [uuid!]!, $readAt: timestamptz!) {
          updateNotifications(
            where: {
              ownerAccountId: { _eq: $owner }
              appId: { _eq: $app }
              recipient: { _eq: $recipient }
              read: { _eq: false }
              id: { _in: $ids }
            }
            _set: { read: true, readAt: $readAt }
          ) {
            affectedRows
          }
        }`;

    const result = await this.gql<{
      updateNotifications: { affectedRows: number };
    }>(mutation, {
      owner: params.ownerAccountId,
      app: params.appId,
      recipient: params.recipient,
      ...(params.all
        ? exclude
          ? { excludeType: exclude }
          : {}
        : { ids: params.ids ?? [] }),
      readAt: new Date().toISOString(),
    });

    return result.updateNotifications.affectedRows;
  }
}

const store: NotificationStore = config.hasuraAdminSecret
  ? new HasuraNotificationStore(config.hasuraUrl, config.hasuraAdminSecret)
  : new MemoryNotificationStore();

function normalizeAppId(appId: string | undefined): string {
  const normalized = appId?.trim().toLowerCase();
  return normalized || 'default';
}

function normalizeEventType(eventType: string | undefined): string | undefined {
  const normalized = eventType?.trim().toLowerCase();
  return normalized || undefined;
}

/**
 * Per-request list page size by API key tier.
 * Free is allowed to read Activity; this only caps page size.
 * Align free with the first-party inbox (`PAGE_SIZE` 40 in onsocial-app).
 * Custom event ingest / rules / webhooks stay paid-gated on the routes.
 */
export function notificationListLimitForTier(tier: Tier): number {
  switch (tier) {
    case 'service':
      return 500;
    case 'scale':
      return 200;
    case 'pro':
      return 50;
    default:
      return 40;
  }
}

export async function listNotifications(params: {
  ownerAccountId: string;
  recipient: string;
  appId?: string;
  limit?: number;
  tier: Tier;
  read?: boolean;
  type?: string;
  eventType?: string;
  cursor?: string;
  excludeType?: string;
}): Promise<NotificationListResult> {
  const maxLimit = notificationListLimitForTier(params.tier);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), maxLimit);

  return store.list({
    ownerAccountId: params.ownerAccountId,
    appId: normalizeAppId(params.appId),
    recipient: params.recipient,
    limit,
    read: params.read,
    type: params.type,
    eventType: normalizeEventType(params.eventType),
    cursor: params.cursor,
    excludeType: params.excludeType?.trim() || undefined,
  });
}

export async function getUnreadNotificationCount(params: {
  ownerAccountId: string;
  appId?: string;
  recipient: string;
  eventType?: string;
  /** Omit a kind from the unread total (e.g. `dm` when mailbox has its own badge). */
  excludeType?: string;
}): Promise<number> {
  return store.countUnread(
    params.ownerAccountId,
    normalizeAppId(params.appId),
    params.recipient,
    normalizeEventType(params.eventType),
    params.excludeType?.trim() || undefined
  );
}

export async function markNotificationsRead(params: {
  ownerAccountId: string;
  appId?: string;
  recipient: string;
  ids?: string[];
  all?: boolean;
  excludeType?: string;
}): Promise<number> {
  return store.markRead({
    ownerAccountId: params.ownerAccountId,
    appId: normalizeAppId(params.appId),
    recipient: params.recipient,
    ids: params.ids,
    all: params.all,
    excludeType: params.excludeType?.trim() || undefined,
  });
}

/** Mark unread `dm` notifications for a thread when the mailbox is marked read. */
export async function markDmNotificationsReadForThread(
  accountId: string,
  threadId: string
): Promise<number> {
  const id = accountId.trim().toLowerCase();
  const thread = threadId.trim();
  if (!id || !thread) return 0;
  try {
    return await store.markRead({
      ownerAccountId: id,
      appId: 'default',
      recipient: id,
      type: 'dm',
      contextContains: { threadId: thread },
    });
  } catch (error) {
    logger.warn({ error, threadId: thread }, 'Failed to sync DM notifications');
    return 0;
  }
}

export function listNotificationTypes(): readonly NotificationType[] {
  return NOTIFICATION_TYPES;
}

logger.info(
  { store: config.hasuraAdminSecret ? 'hasura' : 'memory' },
  'Notifications store initialized'
);
