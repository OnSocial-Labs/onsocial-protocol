/**
 * Data routes — read-only view calls to the core-onsocial contract.
 *
 * GET /data/get?keys=k1,k2&accountId=...  — fetch entries by key
 * GET /data/get-one?key=k&accountId=...    — fetch a single entry
 * GET /data/keys?prefix=p&fromKey=...      — list keys by prefix
 * GET /data/count?prefix=p                 — count keys by prefix
 *
 * Groups / Governance / Permissions / Storage / Contract-info views —
 * each route proxies a single contract view method.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { rpcQuery } from '../rpc/index.js';

export const dataRouter = Router();

const coreContract =
  config.nearNetwork === 'mainnet'
    ? 'core.onsocial.near'
    : 'core.onsocial.testnet';

const tokenContract =
  config.nearNetwork === 'mainnet'
    ? 'token.onsocial.near'
    : 'token.onsocial.testnet';

const boostContract =
  config.nearNetwork === 'mainnet'
    ? 'boost.onsocial.near'
    : 'boost.onsocial.testnet';

interface CallFunctionResult {
  result: number[];
  logs: string[];
  block_height: number;
  block_hash: string;
}

function decodeResult<T>(raw: CallFunctionResult): T {
  const bytes = Buffer.from(raw.result);
  return JSON.parse(bytes.toString('utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Helper — register a GET route that proxies a contract view call.
// `buildArgs` returns an args object or a string error message.
// ---------------------------------------------------------------------------

function contractView(
  routePath: string,
  contractAccount: string,
  methodName: string,
  buildArgs: (q: Request['query']) => Record<string, unknown> | string
): void {
  dataRouter.get(routePath, async (req: Request, res: Response) => {
    const argsOrError = buildArgs(req.query);
    if (typeof argsOrError === 'string') {
      res.status(400).json({ error: argsOrError });
      return;
    }
    try {
      const raw = await rpcQuery<CallFunctionResult>({
        request_type: 'call_function',
        account_id: contractAccount,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(argsOrError)).toString(
          'base64'
        ),
        finality: 'optimistic',
      });
      res.json(decodeResult(raw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: 'RPC call failed', details: msg });
    }
  });
}

function coreView(
  routePath: string,
  methodName: string,
  buildArgs: (q: Request['query']) => Record<string, unknown> | string
): void {
  contractView(routePath, coreContract, methodName, buildArgs);
}

function tokenView(
  routePath: string,
  methodName: string,
  buildArgs: (q: Request['query']) => Record<string, unknown> | string
): void {
  contractView(routePath, tokenContract, methodName, buildArgs);
}

function boostView(
  routePath: string,
  methodName: string,
  buildArgs: (q: Request['query']) => Record<string, unknown> | string
): void {
  contractView(routePath, boostContract, methodName, buildArgs);
}

function requireStr(q: Request['query'], name: string): string | null {
  const v = q[name];
  return typeof v === 'string' && v ? v : null;
}

function hasPageActivationData(
  profile: {
    name?: string;
    bio?: string;
    avatar?: string;
    links?: Array<{ label: string; url: string }>;
    tags?: string[];
  },
  pageConfig: Record<string, unknown>
): boolean {
  return Boolean(
    profile.name?.trim() ||
      profile.bio?.trim() ||
      profile.avatar?.trim() ||
      profile.links?.length ||
      profile.tags?.length ||
      Object.keys(pageConfig).length
  );
}

function optStr(q: Request['query'], name: string): string | undefined {
  const v = q[name];
  return typeof v === 'string' && v ? v : undefined;
}

function optInt(q: Request['query'], name: string, fallback: number): number {
  const v = q[name];
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// GET /data/get — fetch one or more entries by key
// ---------------------------------------------------------------------------
dataRouter.get('/get', async (req: Request, res: Response) => {
  const keysParam = req.query.keys;
  if (!keysParam || typeof keysParam !== 'string') {
    res.status(400).json({ error: 'Missing required query param: keys' });
    return;
  }

  const keys = keysParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    res.status(400).json({ error: 'keys param must not be empty' });
    return;
  }
  if (keys.length > 100) {
    res.status(400).json({ error: 'Maximum 100 keys per request' });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

  const args = { keys, account_id: accountId ?? null };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'get',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entries = decodeResult(raw);
    res.json(entries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/get-one — fetch a single entry
// ---------------------------------------------------------------------------
dataRouter.get('/get-one', async (req: Request, res: Response) => {
  const key = req.query.key;
  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'Missing required query param: key' });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

  const args = { key, account_id: accountId ?? null };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'get_one',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entry = decodeResult(raw);
    res.json(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/keys — list keys by prefix with pagination
// ---------------------------------------------------------------------------
dataRouter.get('/keys', async (req: Request, res: Response) => {
  const prefix = req.query.prefix;
  if (!prefix || typeof prefix !== 'string') {
    res.status(400).json({ error: 'Missing required query param: prefix' });
    return;
  }

  const fromKey =
    typeof req.query.fromKey === 'string' ? req.query.fromKey : undefined;
  const limit =
    typeof req.query.limit === 'string'
      ? Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 50)
      : 50;
  const withValues = req.query.withValues === 'true';

  const args = {
    prefix,
    from_key: fromKey ?? null,
    limit,
    with_values: withValues,
  };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'list_keys',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entries = decodeResult(raw);
    res.json(entries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/count — count keys matching a prefix
// ---------------------------------------------------------------------------
dataRouter.get('/count', async (req: Request, res: Response) => {
  const prefix = req.query.prefix;
  if (!prefix || typeof prefix !== 'string') {
    res.status(400).json({ error: 'Missing required query param: prefix' });
    return;
  }

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'count_keys',
      args_base64: Buffer.from(JSON.stringify({ prefix })).toString('base64'),
      finality: 'optimistic',
    });
    const count = decodeResult<number>(raw);
    res.json({ count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ===========================================================================
// Group views
// ===========================================================================

coreView('/group-config', 'get_group_config', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  return { group_id: groupId };
});

coreView('/group-member', 'get_member_data', (q) => {
  const groupId = requireStr(q, 'groupId');
  const memberId = requireStr(q, 'memberId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!memberId) return 'Missing required query param: memberId';
  return { group_id: groupId, member_id: memberId };
});

coreView('/group-is-member', 'is_group_member', (q) => {
  const groupId = requireStr(q, 'groupId');
  const memberId = requireStr(q, 'memberId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!memberId) return 'Missing required query param: memberId';
  return { group_id: groupId, member_id: memberId };
});

coreView('/group-is-owner', 'is_group_owner', (q) => {
  const groupId = requireStr(q, 'groupId');
  const userId = requireStr(q, 'userId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!userId) return 'Missing required query param: userId';
  return { group_id: groupId, user_id: userId };
});

coreView('/group-is-blacklisted', 'is_blacklisted', (q) => {
  const groupId = requireStr(q, 'groupId');
  const userId = requireStr(q, 'userId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!userId) return 'Missing required query param: userId';
  return { group_id: groupId, user_id: userId };
});

coreView('/group-join-request', 'get_join_request', (q) => {
  const groupId = requireStr(q, 'groupId');
  const requesterId = requireStr(q, 'requesterId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!requesterId) return 'Missing required query param: requesterId';
  return { group_id: groupId, requester_id: requesterId };
});

coreView('/group-stats', 'get_group_stats', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  return { group_id: groupId };
});

// ===========================================================================
// Governance views
// ===========================================================================

coreView('/proposal', 'get_proposal', (q) => {
  const groupId = requireStr(q, 'groupId');
  const proposalId = requireStr(q, 'proposalId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!proposalId) return 'Missing required query param: proposalId';
  return { group_id: groupId, proposal_id: proposalId };
});

coreView('/proposal-tally', 'get_proposal_tally', (q) => {
  const groupId = requireStr(q, 'groupId');
  const proposalId = requireStr(q, 'proposalId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!proposalId) return 'Missing required query param: proposalId';
  return { group_id: groupId, proposal_id: proposalId };
});

coreView('/vote', 'get_vote', (q) => {
  const groupId = requireStr(q, 'groupId');
  const proposalId = requireStr(q, 'proposalId');
  const voter = requireStr(q, 'voter');
  if (!groupId) return 'Missing required query param: groupId';
  if (!proposalId) return 'Missing required query param: proposalId';
  if (!voter) return 'Missing required query param: voter';
  return { group_id: groupId, proposal_id: proposalId, voter };
});

coreView('/proposal-by-sequence', 'get_proposal_by_sequence', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  const seq = requireStr(q, 'sequence');
  if (!seq) return 'Missing required query param: sequence';
  const n = parseInt(seq, 10);
  if (Number.isNaN(n)) return 'sequence must be a number';
  return { group_id: groupId, sequence_number: n };
});

coreView('/proposal-count', 'get_proposal_count', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  return { group_id: groupId };
});

coreView('/proposals', 'list_proposals', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  const args: Record<string, unknown> = { group_id: groupId };
  const from = optStr(q, 'fromSequence');
  if (from !== undefined) {
    const n = parseInt(from, 10);
    if (Number.isNaN(n)) return 'fromSequence must be a number';
    args.from_sequence = n;
  }
  args.limit = optInt(q, 'limit', 50);
  return args;
});

// ===========================================================================
// Permission views
// ===========================================================================

coreView('/has-permission', 'has_permission', (q) => {
  const owner = requireStr(q, 'owner');
  const grantee = requireStr(q, 'grantee');
  const path = requireStr(q, 'path');
  const level = requireStr(q, 'level');
  if (!owner) return 'Missing required query param: owner';
  if (!grantee) return 'Missing required query param: grantee';
  if (!path) return 'Missing required query param: path';
  if (!level) return 'Missing required query param: level';
  const n = parseInt(level, 10);
  if (Number.isNaN(n)) return 'level must be a number';
  return { owner, grantee, path, level: n };
});

coreView('/permissions', 'get_permissions', (q) => {
  const owner = requireStr(q, 'owner');
  const grantee = requireStr(q, 'grantee');
  const path = requireStr(q, 'path');
  if (!owner) return 'Missing required query param: owner';
  if (!grantee) return 'Missing required query param: grantee';
  if (!path) return 'Missing required query param: path';
  return { owner, grantee, path };
});

coreView('/key-permissions', 'get_key_permissions', (q) => {
  const owner = requireStr(q, 'owner');
  const publicKey = requireStr(q, 'publicKey');
  const path = requireStr(q, 'path');
  if (!owner) return 'Missing required query param: owner';
  if (!publicKey) return 'Missing required query param: publicKey';
  if (!path) return 'Missing required query param: path';
  return { owner, public_key: publicKey, path };
});

coreView('/has-key-permission', 'has_key_permission', (q) => {
  const owner = requireStr(q, 'owner');
  const publicKey = requireStr(q, 'publicKey');
  const path = requireStr(q, 'path');
  const level = requireStr(q, 'level');
  if (!owner) return 'Missing required query param: owner';
  if (!publicKey) return 'Missing required query param: publicKey';
  if (!path) return 'Missing required query param: path';
  if (!level) return 'Missing required query param: level';
  const n = parseInt(level, 10);
  if (Number.isNaN(n)) return 'level must be a number';
  return { owner, public_key: publicKey, path, required_level: n };
});

coreView('/has-group-admin', 'has_group_admin_permission', (q) => {
  const groupId = requireStr(q, 'groupId');
  const userId = requireStr(q, 'userId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!userId) return 'Missing required query param: userId';
  return { group_id: groupId, user_id: userId };
});

coreView('/has-group-moderate', 'has_group_moderate_permission', (q) => {
  const groupId = requireStr(q, 'groupId');
  const userId = requireStr(q, 'userId');
  if (!groupId) return 'Missing required query param: groupId';
  if (!userId) return 'Missing required query param: userId';
  return { group_id: groupId, user_id: userId };
});

// ===========================================================================
// On-chain storage views
// ===========================================================================

coreView('/storage-balance', 'get_storage_balance', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});

coreView('/platform-pool', 'get_platform_pool', () => ({}));

coreView('/group-pool', 'get_group_pool_info', (q) => {
  const groupId = requireStr(q, 'groupId');
  if (!groupId) return 'Missing required query param: groupId';
  return { group_id: groupId };
});

coreView('/shared-pool', 'get_shared_pool', (q) => {
  const poolId = requireStr(q, 'poolId');
  if (!poolId) return 'Missing required query param: poolId';
  return { pool_id: poolId };
});

coreView('/platform-allowance', 'get_platform_allowance', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});

coreView('/nonce', 'get_nonce', (q) => {
  const accountId = requireStr(q, 'accountId');
  const publicKey = requireStr(q, 'publicKey');
  if (!accountId) return 'Missing required query param: accountId';
  if (!publicKey) return 'Missing required query param: publicKey';
  return { account_id: accountId, public_key: publicKey };
});

// ===========================================================================
// Contract info views
// ===========================================================================

coreView('/contract-status', 'get_contract_status', () => ({}));
coreView('/version', 'get_version', () => ({}));
coreView('/config', 'get_config', () => ({}));
coreView('/contract-info', 'get_contract_info', () => ({}));
coreView('/wnear-account', 'get_wnear_account', () => ({}));

// ===========================================================================
// SOCIAL token (NEP-141) views
// ===========================================================================

tokenView('/ft-metadata', 'ft_metadata', () => ({}));
tokenView('/ft-total-supply', 'ft_total_supply', () => ({}));
tokenView('/ft-balance-of', 'ft_balance_of', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});
tokenView('/ft-storage-balance', 'storage_balance_of', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});

// ===========================================================================
// Boost contract views
// ===========================================================================

boostView('/boost-stats', 'get_stats', () => ({}));
boostView('/boost-account', 'get_account', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});
boostView('/boost-lock-status', 'get_lock_status', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});
boostView('/boost-reward-rate', 'get_reward_rate', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});
boostView(
  '/boost-storage-subsidy-available',
  'get_storage_subsidy_available',
  () => ({})
);
boostView('/boost-storage-balance', 'storage_balance_of', (q) => {
  const accountId = requireStr(q, 'accountId');
  if (!accountId) return 'Missing required query param: accountId';
  return { account_id: accountId };
});

// ===========================================================================
// Page data — aggregated endpoint for onsocial.id renderer
// ===========================================================================

/** Available page templates. */
const PAGE_TEMPLATES = [
  { id: 'minimal', name: 'Minimal', premium: false },
  { id: 'creator', name: 'Creator', premium: false },
  { id: 'business', name: 'Business', premium: false },
];

dataRouter.get('/page/templates', (_req: Request, res: Response) => {
  res.json(PAGE_TEMPLATES);
});

async function accountExists(accountId: string): Promise<boolean> {
  try {
    await rpcQuery({
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /data/account/exists?accountId=alice.near
 *
 * Returns whether the account exists on the configured NEAR network.
 */
dataRouter.get('/account/exists', async (req: Request, res: Response) => {
  const accountId = requireStr(req.query, 'accountId');
  if (!accountId) {
    res.status(400).json({ error: 'Missing required query param: accountId' });
    return;
  }

  const exists = await accountExists(accountId);
  res.json({ accountId, exists });
});

/**
 * GET /data/page?accountId=alice.near
 *
 * Returns aggregated page data: profile, page config, stats, recent posts,
 * and badges — everything the renderer needs in a single call.
 */
dataRouter.get('/page', async (req: Request, res: Response) => {
  const accountId = requireStr(req.query, 'accountId');
  if (!accountId) {
    res.status(400).json({ error: 'Missing required query param: accountId' });
    return;
  }

  if (!(await accountExists(accountId))) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const keys = [
    'profile/name',
    'profile/bio',
    'profile/avatar',
    'profile/links',
    'profile/tags',
    'page/main',
  ];

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'get',
      args_base64: Buffer.from(
        JSON.stringify({ keys, account_id: accountId })
      ).toString('base64'),
      finality: 'optimistic',
    });

    const entries = decodeResult<
      Array<{
        requested_key: string;
        value: unknown;
        deleted?: boolean;
      }>
    >(raw);

    // Build lookup from key → value
    const kv: Record<string, unknown> = {};
    for (const e of entries) {
      if (!e.deleted && e.value != null) kv[e.requested_key] = e.value;
    }

    // Parse profile
    const parseJson = (v: unknown): unknown => {
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    };

    const profile = {
      name: kv['profile/name'] as string | undefined,
      bio: kv['profile/bio'] as string | undefined,
      avatar: kv['profile/avatar'] as string | undefined,
      links: parseJson(kv['profile/links']) as
        | Array<{ label: string; url: string }>
        | undefined,
      tags: parseJson(kv['profile/tags']) as string[] | undefined,
    };

    // Parse page config
    let pageConfig: Record<string, unknown> = {};
    if (kv['page/main']) {
      const parsed = parseJson(kv['page/main']);
      if (parsed && typeof parsed === 'object') {
        pageConfig = parsed as Record<string, unknown>;
      }
    }

    const activated = hasPageActivationData(profile, pageConfig);

    res.json({
      accountId,
      activated,
      profile,
      config: pageConfig,
      stats: {
        standingCount: 0,
        postCount: 0,
        badgeCount: 0,
        groupCount: 0,
      },
      recentPosts: [],
      badges: [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});
