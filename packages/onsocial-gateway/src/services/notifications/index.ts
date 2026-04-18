import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';

export const NOTIFICATION_TYPES = [
  'reply',
  'quote',
  'reaction',
  'standing_new',
  'reward_credited',
  'reward_claimed',
  'scarces_sold',
  'scarces_offer',
  'group_proposal',
  'group_invite',
  'app_event',
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
}

interface NotificationStore {
  list(params: NotificationListParams): Promise<NotificationListResult>;
  countUnread(
    ownerAccountId: string,
    appId: string,
    recipient: string,
    eventType?: string
  ): Promise<number>;
  markRead(params: {
    ownerAccountId: string;
    appId: string;
    recipient: string;
    ids?: string[];
    all?: boolean;
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
    const filtered = this.notifications
      .filter((item) => item.ownerAccountId === params.ownerAccountId)
      .filter((item) => item.appId === params.appId)
      .filter((item) => item.recipient === params.recipient)
      .filter((item) => params.read === undefined || item.read === params.read)
      .filter((item) => !params.type || item.type === params.type)
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
    eventType?: string
  ): Promise<number> {
    return this.notifications.filter(
      (item) =>
        item.ownerAccountId === ownerAccountId &&
        item.appId === appId &&
        item.recipient === recipient &&
        (!eventType || item.context.eventType === eventType) &&
        !item.read
    ).length;
  }

  async markRead(params: {
    ownerAccountId: string;
    appId: string;
    recipient: string;
    ids?: string[];
    all?: boolean;
  }): Promise<number> {
    let updated = 0;
    for (const item of this.notifications) {
      const matchesScope =
        item.ownerAccountId === params.ownerAccountId &&
        item.appId === params.appId &&
        item.recipient === params.recipient &&
        !item.read;
      const matchesSelection =
        params.all || (params.ids?.includes(item.id) ?? false);

      if (matchesScope && matchesSelection) {
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
    eventType?: string
  ): Promise<number> {
    const eventTypeFilter = normalizeEventType(eventType);
    const whereFields = [
      'ownerAccountId: { _eq: $owner }',
      'appId: { _eq: $app }',
      'recipient: { _eq: $recipient }',
      'read: { _eq: false }',
    ];

    if (eventTypeFilter) {
      whereFields.push('context: { _contains: $eventContext }');
    }

    const countVarDecls = [
      '$owner: String!',
      '$app: String!',
      '$recipient: String!',
    ];
    if (eventTypeFilter) countVarDecls.push('$eventContext: jsonb');

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
  }): Promise<number> {
    const mutation = params.all
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
      ids: params.ids ?? [],
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

function limitForTier(tier: Tier): number {
  switch (tier) {
    case 'service':
      return 500;
    case 'scale':
      return 200;
    case 'pro':
      return 50;
    default:
      return 0;
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
}): Promise<NotificationListResult> {
  const maxLimit = limitForTier(params.tier);
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
  });
}

export async function getUnreadNotificationCount(params: {
  ownerAccountId: string;
  appId?: string;
  recipient: string;
  eventType?: string;
}): Promise<number> {
  return store.countUnread(
    params.ownerAccountId,
    normalizeAppId(params.appId),
    params.recipient,
    normalizeEventType(params.eventType)
  );
}

export async function markNotificationsRead(params: {
  ownerAccountId: string;
  appId?: string;
  recipient: string;
  ids?: string[];
  all?: boolean;
}): Promise<number> {
  return store.markRead({
    ownerAccountId: params.ownerAccountId,
    appId: normalizeAppId(params.appId),
    recipient: params.recipient,
    ids: params.ids,
    all: params.all,
  });
}

export function listNotificationTypes(): readonly NotificationType[] {
  return NOTIFICATION_TYPES;
}

logger.info(
  { store: config.hasuraAdminSecret ? 'hasura' : 'memory' },
  'Notifications store initialized'
);
