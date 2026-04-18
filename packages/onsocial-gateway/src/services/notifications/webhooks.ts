import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { getDeveloperAppById } from '../developer-apps/index.js';

export interface NotificationWebhookRecord {
  id: string;
  ownerAccountId: string;
  appId: string;
  url: string;
  signingSecret: string;
  active: boolean;
  createdAt: number;
}

export interface NotificationWebhookError {
  code: 'INVALID_URL' | 'APP_NOT_FOUND' | 'APP_NOT_OWNED' | 'NOT_FOUND';
  message: string;
}

function normalizeAccountId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAppId(value: string): string {
  return value.trim().toLowerCase();
}

interface NotificationWebhookStore {
  create(
    record: Omit<NotificationWebhookRecord, 'createdAt'>
  ): Promise<NotificationWebhookRecord>;
  listByOwner(ownerAccountId: string): Promise<NotificationWebhookRecord[]>;
  listByOwnerAndApp(
    ownerAccountId: string,
    appId: string
  ): Promise<NotificationWebhookRecord[]>;
  deleteById(ownerAccountId: string, id: string): Promise<boolean>;
  recordAttempt(params: {
    endpointId: string;
    notificationId: string;
    statusCode: number | null;
    success: boolean;
    errorMessage: string | null;
  }): Promise<void>;
}

class MemoryWebhookStore implements NotificationWebhookStore {
  private webhooks = new Map<string, NotificationWebhookRecord>();

  async create(
    record: Omit<NotificationWebhookRecord, 'createdAt'>
  ): Promise<NotificationWebhookRecord> {
    const created = { ...record, createdAt: Date.now() };
    this.webhooks.set(created.id, created);
    return created;
  }

  async listByOwner(
    ownerAccountId: string
  ): Promise<NotificationWebhookRecord[]> {
    return Array.from(this.webhooks.values()).filter(
      (webhook) => webhook.ownerAccountId === ownerAccountId
    );
  }

  async listByOwnerAndApp(
    ownerAccountId: string,
    appId: string
  ): Promise<NotificationWebhookRecord[]> {
    return Array.from(this.webhooks.values()).filter(
      (webhook) =>
        webhook.ownerAccountId === ownerAccountId &&
        webhook.appId === appId &&
        webhook.active
    );
  }

  async deleteById(ownerAccountId: string, id: string): Promise<boolean> {
    const existing = this.webhooks.get(id);
    if (!existing || existing.ownerAccountId !== ownerAccountId) {
      return false;
    }
    this.webhooks.delete(id);
    return true;
  }

  async recordAttempt(): Promise<void> {
    return;
  }
}

class HasuraWebhookStore implements NotificationWebhookStore {
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
      throw new Error(
        `Hasura notification webhooks: ${json.errors[0].message}`
      );
    }
    return json.data!;
  }

  private toRecord(row: Record<string, unknown>): NotificationWebhookRecord {
    return {
      id: row.id as string,
      ownerAccountId: row.ownerAccountId as string,
      appId: row.appId as string,
      url: row.url as string,
      signingSecret: row.signingSecret as string,
      active: Boolean(row.active),
      createdAt: new Date(row.createdAt as string).getTime(),
    };
  }

  async create(
    record: Omit<NotificationWebhookRecord, 'createdAt'>
  ): Promise<NotificationWebhookRecord> {
    const data = await this.gql<{
      insertNotificationWebhookEndpointsOne: Record<string, unknown>;
    }>(
      `mutation($obj: NotificationWebhookEndpointsInsertInput!) {
        insertNotificationWebhookEndpointsOne(object: $obj) {
          id ownerAccountId appId url signingSecret active createdAt
        }
      }`,
      { obj: record }
    );
    return this.toRecord(data.insertNotificationWebhookEndpointsOne);
  }

  async listByOwner(
    ownerAccountId: string
  ): Promise<NotificationWebhookRecord[]> {
    const data = await this.gql<{
      notificationWebhookEndpoints: Array<Record<string, unknown>>;
    }>(
      `query($owner: String!) {
        notificationWebhookEndpoints(where: { ownerAccountId: { _eq: $owner } }, orderBy: [{ createdAt: ASC }]) {
          id ownerAccountId appId url signingSecret active createdAt
        }
      }`,
      { owner: ownerAccountId }
    );
    return data.notificationWebhookEndpoints.map((row) => this.toRecord(row));
  }

  async listByOwnerAndApp(
    ownerAccountId: string,
    appId: string
  ): Promise<NotificationWebhookRecord[]> {
    const data = await this.gql<{
      notificationWebhookEndpoints: Array<Record<string, unknown>>;
    }>(
      `query($owner: String!, $app: String!) {
        notificationWebhookEndpoints(where: { ownerAccountId: { _eq: $owner }, appId: { _eq: $app }, active: { _eq: true } }) {
          id ownerAccountId appId url signingSecret active createdAt
        }
      }`,
      { owner: ownerAccountId, app: appId }
    );
    return data.notificationWebhookEndpoints.map((row) => this.toRecord(row));
  }

  async deleteById(ownerAccountId: string, id: string): Promise<boolean> {
    const data = await this.gql<{
      deleteNotificationWebhookEndpoints: { affectedRows: number };
    }>(
      `mutation($owner: String!, $id: uuid!) {
        deleteNotificationWebhookEndpoints(where: { ownerAccountId: { _eq: $owner }, id: { _eq: $id } }) {
          affectedRows
        }
      }`,
      { owner: ownerAccountId, id }
    );
    return data.deleteNotificationWebhookEndpoints.affectedRows > 0;
  }

  async recordAttempt(params: {
    endpointId: string;
    notificationId: string;
    statusCode: number | null;
    success: boolean;
    errorMessage: string | null;
  }): Promise<void> {
    await this.gql(
      `mutation($obj: NotificationDeliveryAttemptsInsertInput!) {
        insertNotificationDeliveryAttemptsOne(object: $obj) { id }
      }`,
      {
        obj: {
          endpointId: params.endpointId,
          notificationId: params.notificationId,
          statusCode: params.statusCode,
          success: params.success,
          errorMessage: params.errorMessage,
        },
      }
    );
  }
}

function createWebhookStore(): NotificationWebhookStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('Notification webhook store: Hasura/PostgreSQL');
    return new HasuraWebhookStore(config.hasuraUrl, config.hasuraAdminSecret);
  }

  logger.info('Notification webhook store: in-memory');
  return new MemoryWebhookStore();
}

const store = createWebhookStore();

export async function createNotificationWebhook(params: {
  ownerAccountId: string;
  appId: string;
  url: string;
}): Promise<NotificationWebhookRecord | NotificationWebhookError> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    return {
      code: 'INVALID_URL',
      message: 'Webhook URL must be a valid absolute URL',
    };
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    return {
      code: 'INVALID_URL',
      message: 'Webhook URL must use http or https',
    };
  }

  const ownerAccountId = normalizeAccountId(params.ownerAccountId);
  const appId = normalizeAppId(params.appId);
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

  return store.create({
    id: randomUUID(),
    ownerAccountId,
    appId,
    url: parsedUrl.toString(),
    signingSecret: randomBytes(24).toString('base64url'),
    active: true,
  });
}

export async function listNotificationWebhooks(
  ownerAccountId: string
): Promise<NotificationWebhookRecord[]> {
  return store.listByOwner(normalizeAccountId(ownerAccountId));
}

export async function deleteNotificationWebhook(
  ownerAccountId: string,
  id: string
): Promise<boolean> {
  return store.deleteById(normalizeAccountId(ownerAccountId), id);
}

export async function listNotificationWebhooksForApp(
  ownerAccountId: string,
  appId: string
): Promise<NotificationWebhookRecord[]> {
  return store.listByOwnerAndApp(
    normalizeAccountId(ownerAccountId),
    normalizeAppId(appId)
  );
}

export async function sendNotificationWebhookDelivery(params: {
  endpoint: NotificationWebhookRecord;
  payload: Record<string, unknown>;
  notificationId: string;
}): Promise<void> {
  const body = JSON.stringify(params.payload);
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', params.endpoint.signingSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  let statusCode: number | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(params.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-onsocial-webhook-id': params.endpoint.id,
        'x-onsocial-webhook-timestamp': timestamp,
        'x-onsocial-webhook-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = response.status;
    success = response.ok;
    if (!response.ok) {
      errorMessage = `Webhook responded with status ${response.status}`;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error, endpointId: params.endpoint.id },
      'Notification webhook delivery failed'
    );
  }

  try {
    await store.recordAttempt({
      endpointId: params.endpoint.id,
      notificationId: params.notificationId,
      statusCode,
      success,
      errorMessage,
    });
  } catch (error) {
    logger.warn(
      { error, endpointId: params.endpoint.id },
      'Failed to record notification webhook delivery attempt'
    );
  }
}
