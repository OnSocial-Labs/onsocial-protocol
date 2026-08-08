import { cache } from 'react';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  formatDaoRoleLabel,
  resolveLatestProfileUpdateFields,
  sortDaoRoleIds,
  type PageDrawerMeta,
  type ProfileFieldUpdateRow,
} from '@/lib/page-drawer-meta';
import { normalizeProfileTags } from '@/lib/profile-display';
import { getActiveServerNearRpc } from '@/server/near-rpc-bff';

const GOVERNANCE_DAO_ACCOUNT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'governance.onsocial.near'
    : 'governance.onsocial.testnet';

const TREASURY_DAO_ACCOUNT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'treasury.onsocial.near'
    : 'treasury.onsocial.testnet';

interface DaoPolicyRole {
  name?: string;
  kind?: { Group?: string[] };
}

interface DaoPolicy {
  roles?: DaoPolicyRole[];
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function roleIdsForAccount(
  policy: DaoPolicy | null,
  accountId: string
): string[] {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || !policy?.roles?.length) {
    return [];
  }

  return policy.roles
    .filter((role) =>
      role.kind?.Group?.some(
        (member) => normalizeAccountId(member) === normalized
      )
    )
    .map((role) => role.name?.trim() ?? '')
    .filter(Boolean);
}

async function viewContractJson<T>(
  contractId: string,
  method: string
): Promise<T | null> {
  try {
    const rpc = getActiveServerNearRpc();
    const res = await rpc.call<{ result?: number[] }>('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from('{}').toString('base64'),
    });
    const bytes = res.result?.result;
    if (!bytes?.length) {
      return null;
    }
    const decoded = new TextDecoder().decode(new Uint8Array(bytes));
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/** DAO policy roles — client soft-fill only; never block portfolio SSR. */
export async function fetchDaoRoleLabels(accountId: string): Promise<string[]> {
  const [governance, treasury] = await Promise.all([
    viewContractJson<DaoPolicy>(GOVERNANCE_DAO_ACCOUNT, 'get_policy'),
    viewContractJson<DaoPolicy>(TREASURY_DAO_ACCOUNT, 'get_policy'),
  ]);

  const roleIds = sortDaoRoleIds([
    ...roleIdsForAccount(governance, accountId),
    ...roleIdsForAccount(treasury, accountId),
  ]);

  return roleIds.map(formatDaoRoleLabel).filter(Boolean);
}

async function fetchScarceMintCount(accountId: string): Promise<number> {
  try {
    const os = createServerOnSocialClient();
    const mints = await os.query.scarces.mintsBy(accountId, { limit: 100 });
    return mints.length;
  } catch {
    return 0;
  }
}

async function fetchProfileUpdateMeta(accountId: string): Promise<{
  updatedAt: number | null;
  updatedFields: string[];
}> {
  try {
    const os = createServerOnSocialClient();
    const res = await os.query.graphql<{
      profilesCurrent: ProfileFieldUpdateRow[];
    }>({
      query: `query PageDrawerProfileUpdate($id: String!) {
        profilesCurrent(where: {accountId: {_eq: $id}}) {
          field blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId },
    });
    const resolved = resolveLatestProfileUpdateFields(
      res.data?.profilesCurrent ?? []
    );
    return {
      updatedAt: resolved.updatedAt,
      updatedFields: resolved.fields,
    };
  } catch {
    return { updatedAt: null, updatedFields: [] };
  }
}

function emptyMeta(
  display: string,
  options: {
    profileTags?: string[];
    guildCount?: number;
    postCount?: number;
  }
): PageDrawerMeta {
  return {
    name: display,
    joinedAt: null,
    updatedAt: null,
    updatedFields: [],
    postCount: options.postCount ?? 0,
    guildCount: options.guildCount ?? 0,
    scarceMintCount: 0,
    daoRoleLabels: [],
    tags: normalizeProfileTags(options.profileTags),
  };
}

export const fetchPageDrawerMeta = cache(
  async (
    accountId: string,
    options: {
      profileName?: string | null;
      profileTags?: string[];
      guildCount?: number;
      postCount?: number;
    } = {}
  ): Promise<PageDrawerMeta> => {
    const display = options.profileName?.trim() || accountId;

    try {
      const os = createServerOnSocialClient();
      // Indexer-only on the critical path — DAO policy RPCs are drawer chrome
      // and must not block portfolio first paint.
      const [row, scarceMintCount, updateMeta] = await Promise.all([
        os.query.profiles.lookup(accountId),
        fetchScarceMintCount(accountId),
        fetchProfileUpdateMeta(accountId),
      ]);

      return {
        name: display,
        joinedAt: row?.firstProfileTimestamp ?? null,
        updatedAt: updateMeta.updatedAt ?? row?.lastProfileTimestamp ?? null,
        updatedFields: updateMeta.updatedFields,
        postCount: options.postCount ?? 0,
        guildCount: options.guildCount ?? 0,
        scarceMintCount,
        daoRoleLabels: [],
        tags: normalizeProfileTags(options.profileTags),
      };
    } catch {
      return emptyMeta(display, options);
    }
  }
);
