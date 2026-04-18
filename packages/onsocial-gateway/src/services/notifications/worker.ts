import { Client } from 'pg';
import { logger } from '../../logger.js';
import { getDeveloperAppById } from '../developer-apps/index.js';
import {
  type NotificationRuleRecord,
  listAllNotificationRules,
} from './rules.js';
import {
  listNotificationWebhooksForApp,
  sendNotificationWebhookDelivery,
} from './webhooks.js';
import type { NotificationType } from './index.js';

const SOURCE_TABLES = [
  'data_updates',
  'group_updates',
  'rewards_events',
  'boost_events',
  'scarces_events',
  'app_notification_events',
] as const;

const ACTIVE_GROUP_MEMBER_OPERATIONS = new Set([
  'add_member',
  'join_request_approved',
]);

export const NOTIFICATION_WORKER_LOCK_ID = 3489132402;
const APP_NOTIFICATION_CURSOR_FLOOR_UUID =
  '00000000-0000-0000-0000-000000000000';

type SourceTable = (typeof SOURCE_TABLES)[number];
type DbScalar = string | number | boolean | null;
type DbJson = Record<string, unknown>;

interface CursorRow {
  source_table: string;
  last_block_height: string | number;
  last_event_id: string | null;
}

interface DataUpdateRow {
  id: string;
  block_height: string | number | null;
  block_timestamp: string | number | null;
  receipt_id: string | null;
  operation: string | null;
  author: string | null;
  path: string | null;
  value: string | null;
  account_id: string | null;
  data_type: string | null;
  data_id: string | null;
  group_id: string | null;
  target_account: string | null;
  parent_path: string | null;
  parent_author: string | null;
  ref_path: string | null;
  ref_author: string | null;
  extra_data: string | null;
}

interface GroupUpdateRow {
  id: string;
  block_height: string | number | null;
  block_timestamp: string | number | null;
  receipt_id: string | null;
  operation: string | null;
  author: string | null;
  group_id: string | null;
  member_id: string | null;
  role: string | null;
  proposal_id: string | null;
  proposal_type: string | null;
  status: string | null;
  title: string | null;
  description: string | null;
  sequence_number: string | number | null;
}

interface RewardsEventRow {
  id: string;
  block_height: string | number | null;
  block_timestamp: string | number | null;
  receipt_id: string | null;
  account_id: string | null;
  event_type: string | null;
  success: boolean | null;
  amount: string | null;
  source: string | null;
  credited_by: string | null;
  app_id: string | null;
}

interface BoostEventRow {
  id: string;
  block_height: string | number | null;
  block_timestamp: string | number | null;
  receipt_id: string | null;
  account_id: string | null;
  event_type: string | null;
}

interface ScarcesEventRow {
  id: string;
  block_height: string | number | null;
  block_timestamp: string | number | null;
  receipt_id: string | null;
  event_type: string | null;
  operation: string | null;
  author: string | null;
  token_id: string | null;
  collection_id: string | null;
  listing_id: string | null;
  owner_id: string | null;
  creator_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  bidder: string | null;
  winner_id: string | null;
  account_id: string | null;
  amount: string | null;
  price: string | null;
  bid_amount: string | null;
  app_id: string | null;
  scarce_contract_id: string | null;
}

interface AppNotificationEventRow {
  id: string;
  block_height: string | number | null;
  created_at: string | null;
  owner_account_id: string | null;
  app_id: string | null;
  recipient: string | null;
  actor: string | null;
  event_type: string | null;
  dedupe_key: string | null;
  object_id: string | null;
  group_id: string | null;
  source_contract: string | null;
  source_receipt_id: string | null;
  source_block_height: string | number | null;
  context: Record<string, unknown> | null;
}

export interface NotificationInsert {
  ownerAccountId: string;
  appId: string;
  recipient: string;
  actor: string;
  notificationType: NotificationType;
  sourceContract: string;
  sourceReceiptId: string | null;
  sourceBlockHeight: string | number | null;
  dedupeKey: string;
  context: DbJson;
  createdAt: string;
}

export interface NotificationWorkerOptions {
  batchSize?: number;
}

export interface SourceProcessingResult {
  sourceTable: SourceTable;
  processedRows: number;
  insertedNotifications: number;
  lastBlockHeight: string;
  lastEventId: string;
}

function normalizeText(value: DbScalar): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

function normalizeAccountId(value: DbScalar): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeAppId(value: DbScalar): string {
  return normalizeAccountId(value) ?? 'default';
}

function compactContext(context: Record<string, unknown>): DbJson {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      return true;
    })
  );
}

function toIsoFromNanoseconds(
  value: string | number | null | undefined
): string {
  const fallback = new Date().toISOString();
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    const nanoseconds = BigInt(value);
    const milliseconds = Number(nanoseconds / 1_000_000n);
    return new Date(milliseconds).toISOString();
  } catch {
    return fallback;
  }
}

function buildNotification(
  row: {
    id: string;
    block_height: string | number | null;
    block_timestamp: string | number | null;
    receipt_id: string | null;
  },
  input: {
    recipient: string;
    actor: string;
    appId?: string | null;
    notificationType: NotificationType;
    sourceContract: string;
    context: Record<string, unknown>;
  }
): NotificationInsert | null {
  const recipient = normalizeAccountId(input.recipient);
  const actor = normalizeAccountId(input.actor);
  if (!recipient || !actor || recipient === actor) {
    return null;
  }

  const appId = normalizeAppId(input.appId ?? null);

  return {
    ownerAccountId: recipient,
    appId,
    recipient,
    actor,
    notificationType: input.notificationType,
    sourceContract: input.sourceContract,
    sourceReceiptId: normalizeText(row.receipt_id),
    sourceBlockHeight: row.block_height,
    dedupeKey: `${row.id}:${input.notificationType}:${recipient}`,
    context: compactContext(input.context),
    createdAt: toIsoFromNanoseconds(row.block_timestamp),
  };
}

function parseMentions(extraData: string | null): string[] {
  if (!extraData) return [];
  try {
    const parsed = JSON.parse(extraData);
    if (Array.isArray(parsed?.mentions)) {
      return parsed.mentions.filter(
        (m: unknown): m is string => typeof m === 'string' && m.length > 0
      );
    }
  } catch {
    // Malformed JSON — skip
  }
  return [];
}

function extractReactionTargetPath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const match = path.match(/\/reaction\/[^/]+\/(.+)$/);
  return match?.[1] ?? null;
}

export function mapDataUpdateNotifications(
  row: DataUpdateRow
): NotificationInsert[] {
  const operation = normalizeText(row.operation);
  const actor = normalizeAccountId(row.author ?? row.account_id);
  if (operation !== 'set' || !actor) {
    return [];
  }

  const notifications: NotificationInsert[] = [];
  const dataType = normalizeText(row.data_type);

  if (dataType === 'post') {
    const reply = buildNotification(row, {
      recipient: row.parent_author ?? '',
      actor,
      notificationType: 'reply',
      sourceContract: 'core',
      context: {
        postId: normalizeText(row.data_id),
        path: normalizeText(row.path),
        parentPath: normalizeText(row.parent_path),
        groupId: normalizeText(row.group_id),
      },
    });

    const quote = buildNotification(row, {
      recipient: row.ref_author ?? '',
      actor,
      notificationType: 'quote',
      sourceContract: 'core',
      context: {
        postId: normalizeText(row.data_id),
        path: normalizeText(row.path),
        refPath: normalizeText(row.ref_path),
        groupId: normalizeText(row.group_id),
      },
    });

    if (reply) {
      notifications.push(reply);
    }
    if (quote) {
      notifications.push(quote);
    }
  }

  if (dataType === 'reaction') {
    const reaction = buildNotification(row, {
      recipient: row.target_account ?? '',
      actor,
      notificationType: 'reaction',
      sourceContract: 'core',
      context: {
        path: normalizeText(row.path),
        reactionTargetPath: extractReactionTargetPath(row.path),
        reactionValue: normalizeText(row.value),
      },
    });

    if (reaction) {
      notifications.push(reaction);
    }
  }

  if (dataType === 'post') {
    // Extract mentions from extra_data JSON
    const mentionedAccounts = parseMentions(row.extra_data);
    for (const mentioned of mentionedAccounts) {
      const mention = buildNotification(row, {
        recipient: mentioned,
        actor,
        notificationType: 'mention',
        sourceContract: 'core',
        context: {
          postId: normalizeText(row.data_id),
          path: normalizeText(row.path),
          groupId: normalizeText(row.group_id),
        },
      });
      if (mention) {
        notifications.push(mention);
      }
    }
  }

  if (dataType === 'standing') {
    const standing = buildNotification(row, {
      recipient: row.target_account ?? '',
      actor,
      notificationType: 'standing_new',
      sourceContract: 'core',
      context: {
        path: normalizeText(row.path),
        standingValue: normalizeText(row.value),
      },
    });

    if (standing) {
      notifications.push(standing);
    }
  }

  return notifications;
}

export function mapGroupInviteNotification(
  row: GroupUpdateRow
): NotificationInsert[] {
  if (normalizeText(row.operation) !== 'member_invited') {
    return [];
  }

  const notification = buildNotification(row, {
    recipient: row.member_id ?? '',
    actor: row.author ?? '',
    notificationType: 'group_invite',
    sourceContract: 'core',
    context: {
      groupId: normalizeText(row.group_id),
      role: normalizeText(row.role),
    },
  });

  return notification ? [notification] : [];
}

export function mapGroupProposalNotifications(
  row: GroupUpdateRow,
  recipients: string[]
): NotificationInsert[] {
  if (normalizeText(row.operation) !== 'proposal_created') {
    return [];
  }

  return recipients
    .map((recipient) =>
      buildNotification(row, {
        recipient,
        actor: row.author ?? '',
        notificationType: 'group_proposal',
        sourceContract: 'core',
        context: {
          groupId: normalizeText(row.group_id),
          proposalId: normalizeText(row.proposal_id),
          proposalType: normalizeText(row.proposal_type),
          status: normalizeText(row.status),
          title: normalizeText(row.title),
          description: normalizeText(row.description),
          sequenceNumber: normalizeText(row.sequence_number),
        },
      })
    )
    .filter((notification): notification is NotificationInsert =>
      Boolean(notification)
    );
}

export function mapRewardsEventNotifications(
  row: RewardsEventRow
): NotificationInsert[] {
  if (row.success === false) {
    return [];
  }

  const eventType = normalizeText(row.event_type);
  if (eventType === 'REWARD_CREDITED') {
    const notification = buildNotification(row, {
      recipient: row.account_id ?? '',
      actor: row.credited_by ?? row.account_id ?? '',
      appId: row.app_id,
      notificationType: 'reward_credited',
      sourceContract: 'rewards',
      context: {
        amount: normalizeText(row.amount),
        source: normalizeText(row.source),
      },
    });

    return notification ? [notification] : [];
  }

  if (eventType === 'REWARD_CLAIMED') {
    const recipient = normalizeAccountId(row.account_id);
    if (!recipient) {
      return [];
    }

    return [
      {
        ownerAccountId: recipient,
        appId: normalizeAppId(row.app_id),
        recipient,
        actor: recipient,
        notificationType: 'reward_claimed',
        sourceContract: 'rewards',
        sourceReceiptId: normalizeText(row.receipt_id),
        sourceBlockHeight: row.block_height,
        dedupeKey: `${row.id}:reward_claimed:${recipient}`,
        context: compactContext({
          amount: normalizeText(row.amount),
        }),
        createdAt: toIsoFromNanoseconds(row.block_timestamp),
      },
    ];
  }

  return [];
}

export function mapScarcesEventNotifications(
  row: ScarcesEventRow
): NotificationInsert[] {
  const operation = normalizeText(row.operation);
  if (!operation) {
    return [];
  }

  const soldOperations = new Set([
    'purchase',
    'lazy_purchase',
    'auction_settled',
    'offer_accept',
  ]);
  const offerOperations = new Set(['offer_make', 'auction_bid']);

  if (soldOperations.has(operation)) {
    const recipient = normalizeAccountId(row.seller_id ?? row.owner_id);
    const actor = normalizeAccountId(
      row.buyer_id ?? row.winner_id ?? row.author
    );
    if (!recipient || !actor || recipient === actor) {
      return [];
    }

    return [
      {
        ownerAccountId: recipient,
        appId: normalizeAppId(row.app_id),
        recipient,
        actor,
        notificationType: 'scarces_sold',
        sourceContract: 'scarces',
        sourceReceiptId: normalizeText(row.receipt_id),
        sourceBlockHeight: row.block_height,
        dedupeKey: `${row.id}:scarces_sold:${recipient}`,
        context: compactContext({
          tokenId: normalizeText(row.token_id),
          collectionId: normalizeText(row.collection_id),
          listingId: normalizeText(row.listing_id),
          price: normalizeText(row.price ?? row.amount),
          scarceContractId: normalizeText(row.scarce_contract_id),
          buyerId: normalizeAccountId(row.buyer_id ?? row.winner_id),
        }),
        createdAt: toIsoFromNanoseconds(row.block_timestamp),
      },
    ];
  }

  if (offerOperations.has(operation)) {
    const recipient = normalizeAccountId(
      row.owner_id ?? row.seller_id ?? row.creator_id
    );
    const actor = normalizeAccountId(
      row.bidder ?? row.account_id ?? row.author
    );
    if (!recipient || !actor || recipient === actor) {
      return [];
    }

    return [
      {
        ownerAccountId: recipient,
        appId: normalizeAppId(row.app_id),
        recipient,
        actor,
        notificationType: 'scarces_offer',
        sourceContract: 'scarces',
        sourceReceiptId: normalizeText(row.receipt_id),
        sourceBlockHeight: row.block_height,
        dedupeKey: `${row.id}:scarces_offer:${recipient}`,
        context: compactContext({
          tokenId: normalizeText(row.token_id),
          collectionId: normalizeText(row.collection_id),
          listingId: normalizeText(row.listing_id),
          price: normalizeText(row.price),
          bidAmount: normalizeText(row.bid_amount ?? row.amount),
          scarceContractId: normalizeText(row.scarce_contract_id),
        }),
        createdAt: toIsoFromNanoseconds(row.block_timestamp),
      },
    ];
  }

  return [];
}

export function mapAppNotificationEventNotifications(
  row: AppNotificationEventRow
): NotificationInsert[] {
  const ownerAccountId = normalizeAccountId(row.owner_account_id);
  const recipient = normalizeAccountId(row.recipient);
  const actor = normalizeAccountId(row.actor) ?? 'system';
  const appId = normalizeAccountId(row.app_id);
  const eventType = normalizeText(row.event_type);

  if (!ownerAccountId || !recipient || !appId || !eventType) {
    return [];
  }

  const context =
    row.context && typeof row.context === 'object' ? row.context : {};
  const createdAt = row.created_at
    ? new Date(row.created_at).toISOString()
    : new Date().toISOString();

  return [
    {
      ownerAccountId,
      appId,
      recipient,
      actor,
      notificationType: 'app_event',
      sourceContract: normalizeText(row.source_contract) ?? 'app',
      sourceReceiptId: normalizeText(row.source_receipt_id),
      sourceBlockHeight: row.source_block_height,
      dedupeKey: `${normalizeText(row.dedupe_key) ?? row.id}:${recipient}`,
      context: compactContext({
        ...context,
        eventType,
        objectId: normalizeText(row.object_id),
        groupId: normalizeText(row.group_id),
      }),
      createdAt,
    },
  ];
}

function getSelectSql(sourceTable: SourceTable): string {
  switch (sourceTable) {
    case 'data_updates':
      return `
        SELECT id, block_height, block_timestamp, receipt_id, operation, author, path, value,
               account_id, data_type, data_id, group_id, target_account, parent_path,
               parent_author, ref_path, ref_author, extra_data
        FROM data_updates
        WHERE (block_height > $1 OR (block_height = $1 AND id > $2))
        ORDER BY block_height ASC, id ASC
        LIMIT $3
      `;
    case 'group_updates':
      return `
        SELECT id, block_height, block_timestamp, receipt_id, operation, author, group_id,
               member_id, role, proposal_id, proposal_type, status, title, description,
               sequence_number
        FROM group_updates
        WHERE (block_height > $1 OR (block_height = $1 AND id > $2))
        ORDER BY block_height ASC, id ASC
        LIMIT $3
      `;
    case 'rewards_events':
      return `
        SELECT id, block_height, block_timestamp, receipt_id, account_id, event_type, success,
               amount, source, credited_by, app_id
        FROM rewards_events
        WHERE (block_height > $1 OR (block_height = $1 AND id > $2))
        ORDER BY block_height ASC, id ASC
        LIMIT $3
      `;
    case 'boost_events':
      return `
        SELECT id, block_height, block_timestamp, receipt_id, account_id, event_type
        FROM boost_events
        WHERE (block_height > $1 OR (block_height = $1 AND id > $2))
        ORDER BY block_height ASC, id ASC
        LIMIT $3
      `;
    case 'scarces_events':
      return `
        SELECT id, block_height, block_timestamp, receipt_id, event_type, operation, author,
               token_id, collection_id, listing_id, owner_id, creator_id, buyer_id, seller_id,
               bidder, winner_id, account_id, amount, price, bid_amount, app_id,
               scarce_contract_id
        FROM scarces_events
        WHERE (block_height > $1 OR (block_height = $1 AND id > $2))
        ORDER BY block_height ASC, id ASC
        LIMIT $3
      `;
    case 'app_notification_events':
      return `
        SELECT id, sequence AS block_height, created_at, owner_account_id, app_id,
               recipient, actor, event_type, dedupe_key, object_id, group_id,
               source_contract, source_receipt_id, source_block_height, context
        FROM app_notification_events
        WHERE (sequence > $1 OR (sequence = $1 AND id > $2::uuid))
        ORDER BY sequence ASC, id ASC
        LIMIT $3
      `;
  }
}

async function ensureCursorRow(
  client: Client,
  sourceTable: SourceTable
): Promise<void> {
  await client.query(
    `
      INSERT INTO notification_cursors (source_table, last_block_height, last_event_id)
      VALUES ($1, 0, $2)
      ON CONFLICT (source_table) DO NOTHING
    `,
    [
      sourceTable,
      sourceTable === 'app_notification_events'
        ? APP_NOTIFICATION_CURSOR_FLOOR_UUID
        : '',
    ]
  );
}

async function getCursor(
  client: Client,
  sourceTable: SourceTable
): Promise<CursorRow> {
  await ensureCursorRow(client, sourceTable);

  const result = await client.query<CursorRow>(
    `
      SELECT source_table, last_block_height, last_event_id
      FROM notification_cursors
      WHERE source_table = $1
      FOR UPDATE
    `,
    [sourceTable]
  );

  return {
    ...result.rows[0],
    last_event_id:
      sourceTable === 'app_notification_events'
        ? result.rows[0]?.last_event_id || APP_NOTIFICATION_CURSOR_FLOOR_UUID
        : (result.rows[0]?.last_event_id ?? ''),
  };
}

async function listCurrentGroupRecipients(
  client: Client,
  row: GroupUpdateRow
): Promise<string[]> {
  const groupId = normalizeText(row.group_id);
  if (!groupId) {
    return [];
  }

  const result = await client.query<{ account_id: string }>(
    `
      WITH latest_members AS (
        SELECT DISTINCT ON (member_id)
          member_id,
          operation
        FROM group_updates
        WHERE group_id = $1
          AND member_id IS NOT NULL
          AND member_id != ''
        ORDER BY member_id, block_height DESC, id DESC
      ),
      member_accounts AS (
        SELECT author AS account_id
        FROM group_updates
        WHERE group_id = $1
          AND operation = 'create_group'
        UNION
        SELECT member_id AS account_id
        FROM latest_members
        WHERE operation = ANY($2)
      )
      SELECT DISTINCT account_id
      FROM member_accounts
      WHERE account_id IS NOT NULL
        AND account_id != ''
    `,
    [groupId, Array.from(ACTIVE_GROUP_MEMBER_OPERATIONS)]
  );

  return result.rows
    .map((entry) => normalizeAccountId(entry.account_id))
    .filter((accountId): accountId is string => Boolean(accountId));
}

async function resolveOwnerAccountId(
  notification: NotificationInsert
): Promise<string | null> {
  if (notification.sourceContract === 'app') {
    return notification.ownerAccountId;
  }

  if (notification.appId === 'default') {
    return notification.ownerAccountId;
  }

  const app = await getDeveloperAppById(notification.appId);
  return app?.ownerAccountId ?? null;
}

function mapBoostEventNotifications(_row: BoostEventRow): NotificationInsert[] {
  return [];
}

export class NotificationWorker {
  private readonly batchSize: number;
  private ruleCache: NotificationRuleRecord[] | null = null;
  private webhookCache = new Map<
    string,
    Awaited<ReturnType<typeof listNotificationWebhooksForApp>>
  >();

  constructor(
    private readonly client: Client,
    options: NotificationWorkerOptions = {}
  ) {
    this.batchSize = Math.max(options.batchSize ?? 250, 1);
  }

  async acquireLock(): Promise<boolean> {
    const result = await this.client.query<{ pg_try_advisory_lock: boolean }>(
      'SELECT pg_try_advisory_lock($1)',
      [NOTIFICATION_WORKER_LOCK_ID]
    );
    return result.rows[0]?.pg_try_advisory_lock ?? false;
  }

  async releaseLock(): Promise<void> {
    await this.client.query('SELECT pg_advisory_unlock($1)', [
      NOTIFICATION_WORKER_LOCK_ID,
    ]);
  }

  async runOnce(): Promise<SourceProcessingResult[]> {
    this.ruleCache = null;
    this.webhookCache.clear();
    const results: SourceProcessingResult[] = [];
    for (const sourceTable of SOURCE_TABLES) {
      results.push(await this.processSourceTable(sourceTable));
    }
    return results;
  }

  async processSourceTable(
    sourceTable: SourceTable
  ): Promise<SourceProcessingResult> {
    const pendingDeliveries: Array<{
      notificationId: string;
      notification: NotificationInsert;
    }> = [];

    await this.client.query('BEGIN');
    try {
      const cursor = await getCursor(this.client, sourceTable);
      const rows = await this.fetchRows(sourceTable, cursor);

      if (rows.length === 0) {
        await this.client.query('COMMIT');
        return {
          sourceTable,
          processedRows: 0,
          insertedNotifications: 0,
          lastBlockHeight: String(cursor.last_block_height ?? '0'),
          lastEventId: cursor.last_event_id ?? '',
        };
      }

      let insertedNotifications = 0;

      for (const row of rows) {
        const notifications = await this.expandNotificationsForRules(
          await this.mapSourceRow(sourceTable, row)
        );
        for (const notification of notifications) {
          const insertedId = await insertNotification(
            this.client,
            notification
          );
          if (!insertedId) {
            continue;
          }
          insertedNotifications += 1;
          pendingDeliveries.push({
            notificationId: insertedId,
            notification,
          });
        }
      }

      const lastRow = rows.at(-1) as {
        id: string;
        block_height: string | number | null;
      };
      const lastBlockHeight = normalizeText(lastRow.block_height) ?? '0';
      const lastEventId = lastRow.id;

      await this.client.query(
        `
          UPDATE notification_cursors
          SET last_block_height = $2,
              last_event_id = $3,
              last_processed_at = NOW()
          WHERE source_table = $1
        `,
        [sourceTable, lastBlockHeight, lastEventId]
      );

      await this.client.query('COMMIT');

      // Deliver webhooks AFTER commit so Hasura can see the notification rows
      for (const { notificationId, notification } of pendingDeliveries) {
        await this.deliverNotification(notificationId, notification);
      }

      return {
        sourceTable,
        processedRows: rows.length,
        insertedNotifications,
        lastBlockHeight,
        lastEventId,
      };
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  private async fetchRows(
    sourceTable: SourceTable,
    cursor: CursorRow
  ): Promise<Array<Record<string, unknown>>> {
    const cursorEventId =
      sourceTable === 'app_notification_events'
        ? cursor.last_event_id || APP_NOTIFICATION_CURSOR_FLOOR_UUID
        : (cursor.last_event_id ?? '');

    const result = await this.client.query<Record<string, unknown>>(
      getSelectSql(sourceTable),
      [cursor.last_block_height ?? 0, cursorEventId, this.batchSize]
    );

    return result.rows;
  }

  private async mapSourceRow(
    sourceTable: SourceTable,
    row: Record<string, unknown>
  ): Promise<NotificationInsert[]> {
    switch (sourceTable) {
      case 'data_updates':
        return mapDataUpdateNotifications(row as unknown as DataUpdateRow);
      case 'group_updates': {
        const groupRow = row as unknown as GroupUpdateRow;
        const notifications = [...mapGroupInviteNotification(groupRow)];
        if (normalizeText(groupRow.operation) === 'proposal_created') {
          const recipients = await listCurrentGroupRecipients(
            this.client,
            groupRow
          );
          notifications.push(
            ...mapGroupProposalNotifications(groupRow, recipients)
          );
        }
        return notifications;
      }
      case 'rewards_events':
        return mapRewardsEventNotifications(row as unknown as RewardsEventRow);
      case 'boost_events':
        return mapBoostEventNotifications(row as unknown as BoostEventRow);
      case 'scarces_events':
        return mapScarcesEventNotifications(row as unknown as ScarcesEventRow);
      case 'app_notification_events':
        return mapAppNotificationEventNotifications(
          row as unknown as AppNotificationEventRow
        );
    }
  }

  private async expandNotificationsForRules(
    notifications: NotificationInsert[]
  ): Promise<NotificationInsert[]> {
    const expanded: NotificationInsert[] = [];
    for (const notification of notifications) {
      if (
        notification.sourceContract !== 'core' ||
        notification.appId !== 'default'
      ) {
        expanded.push(notification);
        continue;
      }

      const matchedRules = (await this.getRuleCache()).filter((rule) =>
        matchesNotificationRule(rule, notification)
      );

      if (matchedRules.length === 0) {
        expanded.push(notification);
        continue;
      }

      for (const rule of matchedRules) {
        expanded.push({
          ...notification,
          ownerAccountId: rule.ownerAccountId,
          appId: rule.appId,
        });
      }
    }
    return expanded;
  }

  private async getRuleCache(): Promise<NotificationRuleRecord[]> {
    if (!this.ruleCache) {
      this.ruleCache = await listAllNotificationRules();
    }
    return this.ruleCache;
  }

  private async deliverNotification(
    notificationId: string,
    notification: NotificationInsert
  ): Promise<void> {
    const cacheKey = `${notification.ownerAccountId}:${notification.appId}`;
    let endpoints = this.webhookCache.get(cacheKey);
    if (!endpoints) {
      endpoints = await listNotificationWebhooksForApp(
        notification.ownerAccountId,
        notification.appId
      );
      this.webhookCache.set(cacheKey, endpoints);
    }

    for (const endpoint of endpoints) {
      await sendNotificationWebhookDelivery({
        endpoint,
        notificationId,
        payload: {
          event: 'notification.created',
          notification: {
            id: notificationId,
            recipient: notification.recipient,
            actor: notification.actor,
            type: notification.notificationType,
            createdAt: notification.createdAt,
            appId: notification.appId,
            source: {
              contract: notification.sourceContract,
              receiptId: notification.sourceReceiptId,
              blockHeight: notification.sourceBlockHeight,
            },
            context: notification.context,
          },
        },
      });
    }
  }
}

function matchesNotificationRule(
  rule: NotificationRuleRecord,
  notification: NotificationInsert
): boolean {
  if (!rule.active) {
    return false;
  }

  const groupId =
    typeof notification.context.groupId === 'string'
      ? notification.context.groupId
      : null;

  const targetMatches =
    (rule.ruleType === 'recipient' &&
      rule.recipientAccountId === notification.recipient) ||
    (rule.ruleType === 'group' && rule.groupId === groupId);

  if (!targetMatches) {
    return false;
  }

  return (
    !rule.notificationTypes ||
    rule.notificationTypes.includes(notification.notificationType)
  );
}

async function insertNotification(
  client: Client,
  notification: NotificationInsert
): Promise<string | null> {
  const ownerAccountId = await resolveOwnerAccountId(notification);
  if (!ownerAccountId) {
    return null;
  }

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO notifications (
        owner_account_id,
        app_id,
        recipient,
        actor,
        notification_type,
        source_contract,
        source_receipt_id,
        source_block_height,
        dedupe_key,
        context,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (owner_account_id, app_id, dedupe_key) DO NOTHING
      RETURNING id
    `,
    [
      ownerAccountId,
      notification.appId,
      notification.recipient,
      notification.actor,
      notification.notificationType,
      notification.sourceContract,
      notification.sourceReceiptId,
      notification.sourceBlockHeight,
      notification.dedupeKey,
      JSON.stringify(notification.context),
      notification.createdAt,
    ]
  );

  return result.rows[0]?.id ?? null;
}

export async function runNotificationWorkerOnce(
  client: Client,
  options: NotificationWorkerOptions = {}
): Promise<SourceProcessingResult[]> {
  const worker = new NotificationWorker(client, options);
  return worker.runOnce();
}

export function logProcessingSummary(results: SourceProcessingResult[]): void {
  const totals = results.reduce(
    (summary, result) => ({
      processedRows: summary.processedRows + result.processedRows,
      insertedNotifications:
        summary.insertedNotifications + result.insertedNotifications,
    }),
    { processedRows: 0, insertedNotifications: 0 }
  );

  logger.info(
    {
      totals,
      sources: results,
    },
    'Notification worker cycle complete'
  );
}
