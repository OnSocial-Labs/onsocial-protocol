// ---------------------------------------------------------------------------
// NEAR interaction — credit rewards via relayer, view contract state via RPC
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';
import { logger } from '../logger.js';

/** Headers for relayer requests, including API key if configured. */
function relayerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayerApiKey) {
    headers['X-Api-Key'] = config.relayerApiKey;
  }
  return headers;
}

/**
 * Credit a reward on-chain via the relayer (synchronous / confirmed).
 *
 * Builds a `{ type: "credit_reward", account_id, amount, source }` action
 * wrapped in `Auth::Direct` (the relayer's own NEAR account is the
 * authorized_caller on the rewards contract).
 *
 * Uses `?wait=true` so the relayer waits for `broadcast_tx_commit`,
 * giving us ground truth — the credit either landed on-chain or we
 * know it failed.
 *
 * Returns the transaction hash on success, or throws on failure.
 */
export async function creditOnChain(
  accountId: string,
  amount: string,
  source: string,
  appId?: string
): Promise<string> {
  const action: Record<string, string> = {
    type: 'credit_reward',
    account_id: accountId,
    amount,
    source,
  };
  if (appId) action.app_id = appId;

  const request = {
    target_account: config.rewardsContract,
    action,
    auth: { type: 'direct' },
  };

  const response = await fetch(`${config.relayerUrl}/execute?wait=true`, {
    method: 'POST',
    headers: relayerHeaders(),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as {
    success: boolean;
    status?: string;
    tx_hash?: string;
    error?: string;
  };

  if (!data.success) {
    const msg =
      data.error || `Relayer returned ${response.status} (${data.status})`;
    logger.error({ accountId, amount, source, error: msg }, 'Credit failed');
    throw new Error(msg);
  }

  logger.info(
    {
      accountId,
      amount,
      source,
      appId,
      txHash: data.tx_hash,
      status: data.status,
    },
    'Credit confirmed on-chain'
  );
  return data.tx_hash ?? '';
}

/**
 * Execute a gasless claim for a NEAR user via the relayer.
 *
 * Uses intent-based auth — the relayer signs on the user's behalf.
 * Returns the tx hash on success.
 */
export async function claimOnChain(
  accountId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const request = {
    target_account: config.rewardsContract,
    action: { type: 'claim' },
    auth: {
      type: 'intent',
      actor_id: accountId,
      intent: {},
    },
  };

  const response = await fetch(`${config.relayerUrl}/execute?wait=true`, {
    method: 'POST',
    headers: relayerHeaders(),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as {
    success: boolean;
    status?: string;
    tx_hash?: string;
    error?: string;
  };

  if (!data.success) {
    return {
      success: false,
      error:
        data.error || `Relayer returned ${response.status} (${data.status})`,
    };
  }

  logger.info({ accountId, txHash: data.tx_hash }, 'Claim confirmed on-chain');
  return { success: true, txHash: data.tx_hash };
}

/**
 * View a user's claimable balance on the rewards contract via NEAR RPC.
 */
export async function viewClaimable(accountId: string): Promise<string> {
  return viewMethod<string>('get_claimable', { account_id: accountId });
}

/**
 * View a user's full reward record on the rewards contract.
 *
 * Returns the on-chain `UserRewardView` struct. Since v0.1.x the contract
 * returns U128-wrapped strings for all token amounts, so no quoting hack
 * is needed.
 */
export async function viewUserReward(accountId: string): Promise<{
  claimable: string;
  daily_earned: string;
  last_day: number;
  total_earned: string;
  total_claimed: string;
} | null> {
  return viewMethod<{
    claimable: string;
    daily_earned: string;
    last_day: number;
    total_earned: string;
    total_claimed: string;
  } | null>('get_user_reward', { account_id: accountId });
}

/**
 * Check if a NEAR account exists on-chain via RPC.
 */
export async function accountExists(accountId: string): Promise<boolean> {
  try {
    const response = await fetch(config.nearRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'check',
        method: 'query',
        params: {
          request_type: 'view_account',
          finality: 'final',
          account_id: accountId,
        },
      }),
    });
    const data = (await response.json()) as {
      result?: unknown;
      error?: unknown;
    };
    return !!data.result;
  } catch {
    // Network error — don't block linking, just skip validation
    return true;
  }
}

// ---------------------------------------------------------------------------
// Generic NEAR RPC view calls
// ---------------------------------------------------------------------------

/** Call a view method and return the parsed JSON result. */
async function viewMethod<T>(methodName: string, args: object): Promise<T> {
  const raw = await viewMethodRaw(methodName, args);
  return JSON.parse(raw) as T;
}

/** Public wrapper for view calls — used by partner API routes. */
export async function viewContract<T = unknown>(
  methodName: string,
  args: Record<string, string>
): Promise<T> {
  return viewMethod<T>(methodName, args);
}

/** Call a view method and return the raw UTF-8 string (before JSON.parse). */
async function viewMethodRaw(
  methodName: string,
  args: object
): Promise<string> {
  const response = await fetch(config.nearRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'backend',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: config.rewardsContract,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      },
    }),
  });

  const rpcResult = (await response.json()) as {
    result?: { result: number[] };
    error?: unknown;
  };

  if (!rpcResult.result) {
    throw new Error(
      `RPC error calling ${methodName}: ${JSON.stringify(rpcResult.error)}`
    );
  }

  return Buffer.from(rpcResult.result.result).toString();
}
