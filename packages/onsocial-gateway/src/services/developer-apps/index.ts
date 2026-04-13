import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

export interface DeveloperAppRecord {
  appId: string;
  ownerAccountId: string;
  createdAt: number;
}

export interface DeveloperAppError {
  code: 'INVALID_APP_ID' | 'APP_ALREADY_EXISTS' | 'NOT_FOUND';
  message: string;
}

const APP_ID_REGEX = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function normalizeAppId(appId: string): string {
  return appId.trim().toLowerCase();
}

function isValidAppId(appId: string): boolean {
  return APP_ID_REGEX.test(appId);
}

interface DeveloperAppStore {
  register(record: DeveloperAppRecord): Promise<void>;
  listByOwner(ownerAccountId: string): Promise<DeveloperAppRecord[]>;
  deleteByOwner(ownerAccountId: string, appId: string): Promise<boolean>;
  getByAppId(appId: string): Promise<DeveloperAppRecord | null>;
}

class MemoryStore implements DeveloperAppStore {
  private apps = new Map<string, DeveloperAppRecord>();

  async register(record: DeveloperAppRecord): Promise<void> {
    this.apps.set(record.appId, record);
  }

  async listByOwner(ownerAccountId: string): Promise<DeveloperAppRecord[]> {
    return Array.from(this.apps.values()).filter(
      (record) => record.ownerAccountId === ownerAccountId
    );
  }

  async deleteByOwner(ownerAccountId: string, appId: string): Promise<boolean> {
    const existing = this.apps.get(appId);
    if (!existing || existing.ownerAccountId !== ownerAccountId) {
      return false;
    }

    this.apps.delete(appId);
    return true;
  }

  async getByAppId(appId: string): Promise<DeveloperAppRecord | null> {
    return this.apps.get(appId) ?? null;
  }
}

class HasuraStore implements DeveloperAppStore {
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
      throw new Error(`Hasura developer apps: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  private toRecord(row: Record<string, unknown>): DeveloperAppRecord {
    return {
      appId: row.appId as string,
      ownerAccountId: row.ownerAccountId as string,
      createdAt: new Date(row.createdAt as string).getTime(),
    };
  }

  async register(record: DeveloperAppRecord): Promise<void> {
    await this.gql(
      `mutation($obj: developerAppsInsertInput!) {
        insertDeveloperAppsOne(object: $obj) { appId }
      }`,
      {
        obj: {
          appId: record.appId,
          ownerAccountId: record.ownerAccountId,
        },
      }
    );
  }

  async listByOwner(ownerAccountId: string): Promise<DeveloperAppRecord[]> {
    const data = await this.gql<{
      developerApps: Array<Record<string, unknown>>;
    }>(
      `query($owner: String!) {
        developerApps(where: { ownerAccountId: { _eq: $owner } }, orderBy: [{ createdAt: ASC }]) {
          appId
          ownerAccountId
          createdAt
        }
      }`,
      { owner: ownerAccountId }
    );

    return data.developerApps.map((row) => this.toRecord(row));
  }

  async deleteByOwner(ownerAccountId: string, appId: string): Promise<boolean> {
    const data = await this.gql<{
      deleteDeveloperApps: { affectedRows: number };
    }>(
      `mutation($owner: String!, $appId: String!) {
        deleteDeveloperApps(where: { ownerAccountId: { _eq: $owner }, appId: { _eq: $appId } }) {
          affectedRows
        }
      }`,
      { owner: ownerAccountId, appId }
    );

    return data.deleteDeveloperApps.affectedRows > 0;
  }

  async getByAppId(appId: string): Promise<DeveloperAppRecord | null> {
    const data = await this.gql<{
      developerAppsByPk: Record<string, unknown> | null;
    }>(
      `query($appId: String!) {
        developerAppsByPk(appId: $appId) {
          appId
          ownerAccountId
          createdAt
        }
      }`,
      { appId }
    );

    return data.developerAppsByPk
      ? this.toRecord(data.developerAppsByPk)
      : null;
  }
}

function createStore(): DeveloperAppStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('Developer app store: Hasura/PostgreSQL');
    return new HasuraStore(config.hasuraUrl, config.hasuraAdminSecret);
  }

  logger.info('Developer app store: in-memory');
  return new MemoryStore();
}

const store = createStore();

export async function registerDeveloperApp(
  ownerAccountId: string,
  appId: string
): Promise<DeveloperAppRecord | DeveloperAppError> {
  const normalizedOwner = normalizeAccountId(ownerAccountId);
  const normalizedAppId = normalizeAppId(appId);

  if (!isValidAppId(normalizedAppId)) {
    return {
      code: 'INVALID_APP_ID',
      message:
        'appId must be 2-64 chars of lowercase letters, digits, underscores, or hyphens',
    };
  }

  const existing = await store.getByAppId(normalizedAppId);
  if (existing) {
    return {
      code: 'APP_ALREADY_EXISTS',
      message: 'appId is already registered',
    };
  }

  const record: DeveloperAppRecord = {
    appId: normalizedAppId,
    ownerAccountId: normalizedOwner,
    createdAt: Date.now(),
  };
  await store.register(record);
  return record;
}

export async function listDeveloperApps(
  ownerAccountId: string
): Promise<DeveloperAppRecord[]> {
  return store.listByOwner(normalizeAccountId(ownerAccountId));
}

export async function deleteDeveloperApp(
  ownerAccountId: string,
  appId: string
): Promise<boolean> {
  return store.deleteByOwner(
    normalizeAccountId(ownerAccountId),
    normalizeAppId(appId)
  );
}

export async function getDeveloperAppById(
  appId: string
): Promise<DeveloperAppRecord | null> {
  return store.getByAppId(normalizeAppId(appId));
}
