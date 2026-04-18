import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { getDeveloperAppById } from '../developer-apps/index.js';

export type NotificationRuleType = 'recipient' | 'group';

export interface NotificationRuleRecord {
  id: string;
  ownerAccountId: string;
  appId: string;
  ruleType: NotificationRuleType;
  recipientAccountId: string | null;
  groupId: string | null;
  notificationTypes: string[] | null;
  active: boolean;
  createdAt: number;
}

export interface NotificationRuleError {
  code: 'INVALID_RULE' | 'APP_NOT_FOUND' | 'APP_NOT_OWNED' | 'NOT_FOUND';
  message: string;
}

function normalizeAccountId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullableAccountId(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeAppId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeTypes(types?: string[]): string[] | null {
  if (!types || types.length === 0) {
    return null;
  }

  const normalized = Array.from(
    new Set(types.map((entry) => entry.trim().toLowerCase()).filter(Boolean))
  );

  return normalized.length > 0 ? normalized : null;
}

interface NotificationRuleStore {
  create(
    record: Omit<NotificationRuleRecord, 'createdAt'>
  ): Promise<NotificationRuleRecord>;
  listByOwner(ownerAccountId: string): Promise<NotificationRuleRecord[]>;
  listActive(): Promise<NotificationRuleRecord[]>;
  deleteById(ownerAccountId: string, id: string): Promise<boolean>;
}

class MemoryRuleStore implements NotificationRuleStore {
  private rules = new Map<string, NotificationRuleRecord>();

  async create(
    record: Omit<NotificationRuleRecord, 'createdAt'>
  ): Promise<NotificationRuleRecord> {
    const created = { ...record, createdAt: Date.now() };
    this.rules.set(created.id, created);
    return created;
  }

  async listByOwner(ownerAccountId: string): Promise<NotificationRuleRecord[]> {
    return Array.from(this.rules.values()).filter(
      (rule) => rule.ownerAccountId === ownerAccountId
    );
  }

  async listActive(): Promise<NotificationRuleRecord[]> {
    return Array.from(this.rules.values()).filter((rule) => rule.active);
  }

  async deleteById(ownerAccountId: string, id: string): Promise<boolean> {
    const existing = this.rules.get(id);
    if (!existing || existing.ownerAccountId !== ownerAccountId) {
      return false;
    }

    this.rules.delete(id);
    return true;
  }
}

class HasuraRuleStore implements NotificationRuleStore {
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
      throw new Error(`Hasura notification rules: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  private toRecord(row: Record<string, unknown>): NotificationRuleRecord {
    return {
      id: row.id as string,
      ownerAccountId: row.ownerAccountId as string,
      appId: row.appId as string,
      ruleType: row.ruleType as NotificationRuleType,
      recipientAccountId: (row.recipientAccountId as string | null) ?? null,
      groupId: (row.groupId as string | null) ?? null,
      notificationTypes: (row.notificationTypes as string[] | null) ?? null,
      active: Boolean(row.active),
      createdAt: new Date(row.createdAt as string).getTime(),
    };
  }

  async create(
    record: Omit<NotificationRuleRecord, 'createdAt'>
  ): Promise<NotificationRuleRecord> {
    const data = await this.gql<{
      insertDeveloperNotificationRulesOne: Record<string, unknown>;
    }>(
      `mutation($obj: DeveloperNotificationRulesInsertInput!) {
        insertDeveloperNotificationRulesOne(object: $obj) {
          id ownerAccountId appId ruleType recipientAccountId groupId notificationTypes active createdAt
        }
      }`,
      { obj: record }
    );

    return this.toRecord(data.insertDeveloperNotificationRulesOne);
  }

  async listByOwner(ownerAccountId: string): Promise<NotificationRuleRecord[]> {
    const data = await this.gql<{
      developerNotificationRules: Array<Record<string, unknown>>;
    }>(
      `query($owner: String!) {
        developerNotificationRules(where: { ownerAccountId: { _eq: $owner } }, orderBy: [{ createdAt: ASC }]) {
          id ownerAccountId appId ruleType recipientAccountId groupId notificationTypes active createdAt
        }
      }`,
      { owner: ownerAccountId }
    );

    return data.developerNotificationRules.map((row) => this.toRecord(row));
  }

  async listActive(): Promise<NotificationRuleRecord[]> {
    const data = await this.gql<{
      developerNotificationRules: Array<Record<string, unknown>>;
    }>(
      `query {
        developerNotificationRules(where: { active: { _eq: true } }) {
          id ownerAccountId appId ruleType recipientAccountId groupId notificationTypes active createdAt
        }
      }`
    );

    return data.developerNotificationRules.map((row) => this.toRecord(row));
  }

  async deleteById(ownerAccountId: string, id: string): Promise<boolean> {
    const data = await this.gql<{
      deleteDeveloperNotificationRules: { affectedRows: number };
    }>(
      `mutation($owner: String!, $id: uuid!) {
        deleteDeveloperNotificationRules(where: { ownerAccountId: { _eq: $owner }, id: { _eq: $id } }) {
          affectedRows
        }
      }`,
      { owner: ownerAccountId, id }
    );

    return data.deleteDeveloperNotificationRules.affectedRows > 0;
  }
}

function createRuleStore(): NotificationRuleStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('Notification rule store: Hasura/PostgreSQL');
    return new HasuraRuleStore(config.hasuraUrl, config.hasuraAdminSecret);
  }

  logger.info('Notification rule store: in-memory');
  return new MemoryRuleStore();
}

const store = createRuleStore();

export async function createNotificationRule(params: {
  ownerAccountId: string;
  appId: string;
  ruleType: NotificationRuleType;
  recipientAccountId?: string;
  groupId?: string;
  notificationTypes?: string[];
}): Promise<NotificationRuleRecord | NotificationRuleError> {
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

  const recipientAccountId = normalizeNullableAccountId(
    params.recipientAccountId
  );
  const groupId = normalizeNullableText(params.groupId);

  if (
    (params.ruleType === 'recipient' && !recipientAccountId) ||
    (params.ruleType === 'group' && !groupId)
  ) {
    return {
      code: 'INVALID_RULE',
      message: 'rule target is required for this ruleType',
    };
  }

  return store.create({
    id: crypto.randomUUID(),
    ownerAccountId,
    appId,
    ruleType: params.ruleType,
    recipientAccountId,
    groupId,
    notificationTypes: normalizeTypes(params.notificationTypes),
    active: true,
  });
}

export async function listNotificationRules(
  ownerAccountId: string
): Promise<NotificationRuleRecord[]> {
  return store.listByOwner(normalizeAccountId(ownerAccountId));
}

export async function deleteNotificationRule(
  ownerAccountId: string,
  id: string
): Promise<boolean> {
  return store.deleteById(normalizeAccountId(ownerAccountId), id);
}

export async function listAllNotificationRules(): Promise<
  NotificationRuleRecord[]
> {
  return store.listActive();
}
