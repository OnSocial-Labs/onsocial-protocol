import { cache } from 'react';
import { ACTIVE_BACKEND_URL, ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  formatDaoRoleLabel,
  resolveLatestProfileUpdateFields,
  sortDaoRoleIds,
  type PageDrawerMeta,
  type ProfileFieldUpdateRow,
} from '@/lib/page-drawer-meta';
import { normalizeProfileTags } from '@/lib/profile-display';
import {
  EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS,
  type ProtocolDaoProposerFlags,
} from '@/lib/protocol-dao-memberships';
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
  kind?:
    | string
    | {
        Everyone?: unknown;
        Group?: string[];
        Member?: string;
      };
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
    .filter((role) => {
      const kind = role.kind;
      if (!kind || typeof kind === 'string') return false;
      const group = kind.Group;
      if (!Array.isArray(group)) return false;
      return group.some(
        (member) => normalizeAccountId(String(member)) === normalized
      );
    })
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

/** DAO policies change rarely — reuse across sheet opens / concurrent lookups. */
const DAO_POLICY_TTL_MS = 5 * 60 * 1000;
let daoPolicyCache: {
  at: number;
  governance: DaoPolicy | null;
  treasury: DaoPolicy | null;
} | null = null;

async function loadDaoPolicies(): Promise<{
  governance: DaoPolicy | null;
  treasury: DaoPolicy | null;
}> {
  const now = Date.now();
  if (daoPolicyCache && now - daoPolicyCache.at < DAO_POLICY_TTL_MS) {
    return {
      governance: daoPolicyCache.governance,
      treasury: daoPolicyCache.treasury,
    };
  }
  const [governance, treasury] = await Promise.all([
    viewContractJson<DaoPolicy>(GOVERNANCE_DAO_ACCOUNT, 'get_policy'),
    viewContractJson<DaoPolicy>(TREASURY_DAO_ACCOUNT, 'get_policy'),
  ]);
  daoPolicyCache = { at: now, governance, treasury };
  return { governance, treasury };
}

/** DAO policy roles — client soft-fill only; never block portfolio SSR. */
export async function fetchDaoRoleIds(accountId: string): Promise<string[]> {
  const memberships = await fetchProtocolDaoMemberships(accountId);
  return sortDaoRoleIds(
    [memberships.governance, memberships.treasury].filter(
      (role): role is NonNullable<typeof role> => role != null
    )
  );
}

export type ProtocolDaoCouncilRole = import('@/lib/protocol-dao-memberships').ProtocolDaoCouncilRole;
export type ProtocolDaoMemberships =
  import('@/lib/protocol-dao-memberships').ProtocolDaoMemberships;

function primaryCouncilRole(
  roleIds: string[]
): ProtocolDaoCouncilRole | null {
  const normalized = roleIds.map((id) => id.trim().toLowerCase());
  if (normalized.includes('guardians')) return 'guardians';
  if (normalized.includes('council')) return 'council';
  return null;
}

/** Per protocol DAO council membership — used for dual identity marks. */
export async function fetchProtocolDaoMemberships(
  accountId: string
): Promise<Omit<import('@/lib/protocol-dao-memberships').ProtocolDaoMemberships, 'proposer'>> {
  const { governance, treasury } = await loadDaoPolicies();
  return {
    governance: primaryCouncilRole(roleIdsForAccount(governance, accountId)),
    treasury: primaryCouncilRole(roleIdsForAccount(treasury, accountId)),
  };
}

function parseProtocolDaoProposerFlags(
  value: unknown
): ProtocolDaoProposerFlags {
  if (!value || typeof value !== 'object') {
    return EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS;
  }
  const record = value as Record<string, unknown>;
  return {
    governance: record.governance === true,
    treasury: record.treasury === true,
  };
}

/** Whether the account has submitted proposals to protocol Governance / Treasury. */
export async function fetchProtocolDaoProposerFlags(
  accountId: string
): Promise<ProtocolDaoProposerFlags> {
  try {
    const res = await fetch(
      `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/dao-proposer-flags?accountId=${encodeURIComponent(accountId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS;
    const body = (await res.json().catch(() => null)) as {
      proposer?: unknown;
    } | null;
    return parseProtocolDaoProposerFlags(body?.proposer);
  } catch {
    return EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS;
  }
}

export async function fetchDaoRoleLabels(accountId: string): Promise<string[]> {
  return (await fetchDaoRoleIds(accountId))
    .map(formatDaoRoleLabel)
    .filter(Boolean);
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
