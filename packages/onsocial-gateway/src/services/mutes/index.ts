import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

export interface MuteRecord {
  mutedAccountId: string;
  createdAt: string;
}

export interface MuteError {
  code: 'INVALID_ACCOUNT' | 'SELF_MUTE' | 'NOT_FOUND';
  message: string;
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function isValidAccountId(accountId: string): boolean {
  return accountId.length > 0 && accountId.includes('.');
}

interface MuteStore {
  list(ownerAccountId: string): Promise<MuteRecord[]>;
  add(ownerAccountId: string, mutedAccountId: string): Promise<MuteRecord>;
  remove(ownerAccountId: string, mutedAccountId: string): Promise<boolean>;
  has(ownerAccountId: string, mutedAccountId: string): Promise<boolean>;
}

class MemoryMuteStore implements MuteStore {
  private rows = new Map<string, Map<string, MuteRecord>>();

  private bucket(ownerAccountId: string): Map<string, MuteRecord> {
    let map = this.rows.get(ownerAccountId);
    if (!map) {
      map = new Map();
      this.rows.set(ownerAccountId, map);
    }
    return map;
  }

  async list(ownerAccountId: string): Promise<MuteRecord[]> {
    return Array.from(this.bucket(ownerAccountId).values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  async add(
    ownerAccountId: string,
    mutedAccountId: string
  ): Promise<MuteRecord> {
    const existing = this.bucket(ownerAccountId).get(mutedAccountId);
    if (existing) return existing;
    const record: MuteRecord = {
      mutedAccountId,
      createdAt: new Date().toISOString(),
    };
    this.bucket(ownerAccountId).set(mutedAccountId, record);
    return record;
  }

  async remove(
    ownerAccountId: string,
    mutedAccountId: string
  ): Promise<boolean> {
    return this.bucket(ownerAccountId).delete(mutedAccountId);
  }

  async has(ownerAccountId: string, mutedAccountId: string): Promise<boolean> {
    return this.bucket(ownerAccountId).has(mutedAccountId);
  }
}

class HasuraMuteStore implements MuteStore {
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
      throw new Error(`Hasura mutes: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  async list(ownerAccountId: string): Promise<MuteRecord[]> {
    const data = await this.gql<{
      userMutes: Array<{ mutedAccountId: string; createdAt: string }>;
    }>(
      `query($owner: String!) {
        userMutes(
          where: { ownerAccountId: { _eq: $owner } },
          orderBy: [{ createdAt: DESC }]
        ) {
          mutedAccountId
          createdAt
        }
      }`,
      { owner: ownerAccountId }
    );
    return data.userMutes.map((row) => ({
      mutedAccountId: row.mutedAccountId,
      createdAt: row.createdAt,
    }));
  }

  async add(
    ownerAccountId: string,
    mutedAccountId: string
  ): Promise<MuteRecord> {
    const data = await this.gql<{
      insertUserMutesOne: {
        mutedAccountId: string;
        createdAt: string;
      } | null;
    }>(
      `mutation($obj: UserMutesInsertInput!) {
        insertUserMutesOne(
          object: $obj,
          onConflict: {
            constraint: user_mutes_pkey,
            updateColumns: []
          }
        ) {
          mutedAccountId
          createdAt
        }
      }`,
      {
        obj: {
          ownerAccountId,
          mutedAccountId,
        },
      }
    );

    if (data.insertUserMutesOne) {
      return {
        mutedAccountId: data.insertUserMutesOne.mutedAccountId,
        createdAt: data.insertUserMutesOne.createdAt,
      };
    }

    const existing = await this.list(ownerAccountId);
    const hit = existing.find((row) => row.mutedAccountId === mutedAccountId);
    if (hit) return hit;
    return {
      mutedAccountId,
      createdAt: new Date().toISOString(),
    };
  }

  async remove(
    ownerAccountId: string,
    mutedAccountId: string
  ): Promise<boolean> {
    const data = await this.gql<{
      deleteUserMutes: { affectedRows: number };
    }>(
      `mutation($owner: String!, $muted: String!) {
        deleteUserMutes(
          where: {
            ownerAccountId: { _eq: $owner },
            mutedAccountId: { _eq: $muted }
          }
        ) {
          affectedRows
        }
      }`,
      { owner: ownerAccountId, muted: mutedAccountId }
    );
    return data.deleteUserMutes.affectedRows > 0;
  }

  async has(ownerAccountId: string, mutedAccountId: string): Promise<boolean> {
    const data = await this.gql<{
      userMutes: Array<{ mutedAccountId: string }>;
    }>(
      `query($owner: String!, $muted: String!) {
        userMutes(
          where: {
            ownerAccountId: { _eq: $owner },
            mutedAccountId: { _eq: $muted }
          },
          limit: 1
        ) {
          mutedAccountId
        }
      }`,
      { owner: ownerAccountId, muted: mutedAccountId }
    );
    return (data.userMutes?.length ?? 0) > 0;
  }
}

function createStore(): MuteStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('Mute store: Hasura/PostgreSQL');
    return new HasuraMuteStore(config.hasuraUrl, config.hasuraAdminSecret);
  }
  logger.info('Mute store: in-memory');
  return new MemoryMuteStore();
}

const store = createStore();

export async function listMutes(ownerAccountId: string): Promise<MuteRecord[]> {
  return store.list(normalizeAccountId(ownerAccountId));
}

export async function addMute(
  ownerAccountId: string,
  mutedAccountId: string
): Promise<MuteRecord | MuteError> {
  const owner = normalizeAccountId(ownerAccountId);
  const muted = normalizeAccountId(mutedAccountId);
  if (!isValidAccountId(muted)) {
    return { code: 'INVALID_ACCOUNT', message: 'mutedAccountId is invalid' };
  }
  if (owner === muted) {
    return { code: 'SELF_MUTE', message: 'You cannot mute yourself' };
  }
  return store.add(owner, muted);
}

export async function removeMute(
  ownerAccountId: string,
  mutedAccountId: string
): Promise<true | MuteError> {
  const owner = normalizeAccountId(ownerAccountId);
  const muted = normalizeAccountId(mutedAccountId);
  if (!isValidAccountId(muted)) {
    return { code: 'INVALID_ACCOUNT', message: 'mutedAccountId is invalid' };
  }
  const removed = await store.remove(owner, muted);
  if (!removed) {
    return { code: 'NOT_FOUND', message: 'Mute not found' };
  }
  return true;
}

export async function hasMute(
  ownerAccountId: string,
  mutedAccountId: string
): Promise<boolean> {
  return store.has(
    normalizeAccountId(ownerAccountId),
    normalizeAccountId(mutedAccountId)
  );
}
