import { Pool } from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { getDeveloperAppById } from '../developer-apps/index.js';

export interface AppNotificationEventInput {
  recipient: string;
  actor?: string;
  eventType: string;
  dedupeKey: string;
  objectId?: string;
  groupId?: string;
  sourceContract?: string;
  sourceReceiptId?: string;
  sourceBlockHeight?: string | number;
  createdAt?: string;
  context?: Record<string, unknown>;
}

export interface AppNotificationEventError {
  code:
    | 'INVALID_APP_EVENT'
    | 'APP_NOT_FOUND'
    | 'APP_NOT_OWNED'
    | 'DATABASE_NOT_CONFIGURED';
  message: string;
}

export interface AppNotificationEventIngestResult {
  id: string | null;
  dedupeKey: string;
  status: 'queued' | 'duplicate';
}

interface PersistedAppNotificationEvent {
  ownerAccountId: string;
  appId: string;
  recipient: string;
  actor: string;
  eventType: string;
  dedupeKey: string;
  objectId: string | null;
  groupId: string | null;
  sourceContract: string;
  sourceReceiptId: string | null;
  sourceBlockHeight: string | number | null;
  createdAt: string;
  context: Record<string, unknown>;
}

interface AppNotificationEventStore {
  insert(
    event: PersistedAppNotificationEvent
  ): Promise<AppNotificationEventIngestResult>;
}

const EVENT_TYPE_REGEX = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_BATCH_SIZE = 100;

function normalizeAccountId(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeAppId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEventType(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !EVENT_TYPE_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeSourceContract(value: string | undefined): string {
  return normalizeText(value)?.toLowerCase() ?? 'app';
}

function normalizeCreatedAt(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class MemoryAppNotificationEventStore implements AppNotificationEventStore {
  private events = new Map<
    string,
    PersistedAppNotificationEvent & { id: string }
  >();

  async insert(
    event: PersistedAppNotificationEvent
  ): Promise<AppNotificationEventIngestResult> {
    const key = [
      event.ownerAccountId,
      event.appId,
      event.recipient,
      event.dedupeKey,
    ].join(':');

    const existing = this.events.get(key);
    if (existing) {
      return {
        id: existing.id,
        dedupeKey: event.dedupeKey,
        status: 'duplicate',
      };
    }

    const id = crypto.randomUUID();
    this.events.set(key, { ...event, id });
    return { id, dedupeKey: event.dedupeKey, status: 'queued' };
  }
}

class PostgresAppNotificationEventStore implements AppNotificationEventStore {
  constructor(private readonly pool: Pool) {}

  async insert(
    event: PersistedAppNotificationEvent
  ): Promise<AppNotificationEventIngestResult> {
    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO app_notification_events (
          owner_account_id,
          app_id,
          recipient,
          actor,
          event_type,
          dedupe_key,
          object_id,
          group_id,
          source_contract,
          source_receipt_id,
          source_block_height,
          created_at,
          context
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
        )
        ON CONFLICT (owner_account_id, app_id, recipient, dedupe_key) DO NOTHING
        RETURNING id
      `,
      [
        event.ownerAccountId,
        event.appId,
        event.recipient,
        event.actor,
        event.eventType,
        event.dedupeKey,
        event.objectId,
        event.groupId,
        event.sourceContract,
        event.sourceReceiptId,
        event.sourceBlockHeight,
        event.createdAt,
        JSON.stringify(event.context),
      ]
    );

    return {
      id: result.rows[0]?.id ?? null,
      dedupeKey: event.dedupeKey,
      status: result.rows[0]?.id ? 'queued' : 'duplicate',
    };
  }
}

const databaseUrl = process.env.DATABASE_URL;
const store: AppNotificationEventStore = databaseUrl
  ? new PostgresAppNotificationEventStore(
      new Pool({ connectionString: databaseUrl })
    )
  : new MemoryAppNotificationEventStore();

if (databaseUrl) {
  logger.info('App notification event store: PostgreSQL');
} else {
  logger.info('App notification event store: in-memory');
}

export async function ingestAppNotificationEvents(params: {
  ownerAccountId: string;
  appId: string;
  events: AppNotificationEventInput[];
}): Promise<AppNotificationEventIngestResult[] | AppNotificationEventError> {
  const ownerAccountId = normalizeAccountId(params.ownerAccountId);
  const appId = normalizeAppId(params.appId);

  if (!ownerAccountId) {
    return {
      code: 'INVALID_APP_EVENT',
      message: 'ownerAccountId is required',
    };
  }

  if (!appId) {
    return {
      code: 'INVALID_APP_EVENT',
      message: 'appId is required',
    };
  }

  if (!databaseUrl && config.nodeEnv === 'production') {
    return {
      code: 'DATABASE_NOT_CONFIGURED',
      message: 'DATABASE_URL is required for app notification event ingestion',
    };
  }

  if (!Array.isArray(params.events) || params.events.length === 0) {
    return {
      code: 'INVALID_APP_EVENT',
      message: 'events must contain at least one item',
    };
  }

  if (params.events.length > MAX_BATCH_SIZE) {
    return {
      code: 'INVALID_APP_EVENT',
      message: `events may contain at most ${MAX_BATCH_SIZE} items`,
    };
  }

  const app = await getDeveloperAppById(appId);
  if (!app) {
    return { code: 'APP_NOT_FOUND', message: 'appId is not registered' };
  }
  if (app.ownerAccountId !== ownerAccountId) {
    return {
      code: 'APP_NOT_OWNED',
      message: 'appId is not owned by this developer',
    };
  }

  const normalizedEvents: PersistedAppNotificationEvent[] = [];

  for (const event of params.events) {
    const recipient = normalizeAccountId(event.recipient);
    const actor = normalizeAccountId(event.actor) ?? 'system';
    const eventType = normalizeEventType(event.eventType);
    const dedupeKey = normalizeText(event.dedupeKey);

    if (!recipient) {
      return {
        code: 'INVALID_APP_EVENT',
        message: 'recipient is required for every event',
      };
    }

    if (!eventType) {
      return {
        code: 'INVALID_APP_EVENT',
        message:
          'eventType must be 1-64 chars of lowercase letters, digits, dots, colons, underscores, or hyphens',
      };
    }

    if (!dedupeKey) {
      return {
        code: 'INVALID_APP_EVENT',
        message: 'dedupeKey is required for every event',
      };
    }

    if (event.context !== undefined && !isPlainObject(event.context)) {
      return {
        code: 'INVALID_APP_EVENT',
        message: 'context must be a JSON object when provided',
      };
    }

    normalizedEvents.push({
      ownerAccountId,
      appId,
      recipient,
      actor,
      eventType,
      dedupeKey,
      objectId: normalizeText(event.objectId),
      groupId: normalizeText(event.groupId),
      sourceContract: normalizeSourceContract(event.sourceContract),
      sourceReceiptId: normalizeText(event.sourceReceiptId),
      sourceBlockHeight: event.sourceBlockHeight ?? null,
      createdAt: normalizeCreatedAt(event.createdAt),
      context: event.context ?? {},
    });
  }

  const results: AppNotificationEventIngestResult[] = [];
  for (const event of normalizedEvents) {
    results.push(await store.insert(event));
  }

  return results;
}
