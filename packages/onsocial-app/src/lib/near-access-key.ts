import {
  createBffNearRpcClient,
  createConfiguredNearRpc,
  resolveNearRpcBffEndpoint,
  type NearRpc,
} from '@onsocial/rpc';
import { parseEd25519PublicKey } from '@onsocial/sdk/advanced';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

/**
 * Browser NEAR RPC for session key checks — same BFF path as `app-near-rpc.ts`.
 * Do not call public `rpc.*.near.org` from the browser (CORS / Failed to fetch).
 */

type ViewAccessKeyPermission =
  | {
      FunctionCall?: {
        receiver_id?: string;
        method_names?: string[];
        allowance?: string | null;
      };
    }
  | 'FullAccess';

let _rpc: NearRpc | null = null;

function getRpc(): NearRpc {
  if (!_rpc) {
    if (typeof window !== 'undefined') {
      _rpc = createBffNearRpcClient({
        endpoint: resolveNearRpcBffEndpoint({ path: '/api/near/rpc' }),
        network: ACTIVE_NEAR_NETWORK,
      });
    } else {
      _rpc = createConfiguredNearRpc({
        network: ACTIVE_NEAR_NETWORK,
        publicOnly: false,
        timeoutMs: 8_000,
        maxRetries: 1,
      });
    }
  }
  return _rpc;
}

function isUnknownAccessKeyError(error: unknown): boolean {
  if (!error) return false;
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);
  return /UNKNOWN_ACCESS_KEY|does not exist|AccessKeyNotFound|doesn't exist/i.test(
    text
  );
}

/**
 * True when `publicKey` (`ed25519:…`) is on the account's access-key list.
 * Compares decoded key bytes so base58/base64 forms of the same key match.
 */
export async function accountOwnsPublicKey(
  accountId: string,
  publicKey: string
): Promise<boolean> {
  const owner = accountId.trim();
  const key = publicKey.trim();
  if (!owner || !key) return false;

  const rpc = getRpc();
  try {
    const res = await rpc.call<{
      keys?: Array<{ public_key?: string }>;
    }>('query', {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: owner,
    });

    if (res.error) {
      throw new Error(
        typeof res.error.message === 'string'
          ? res.error.message
          : 'NEAR access key list query failed'
      );
    }

    const keys = res.result?.keys;
    if (!Array.isArray(keys) || keys.length === 0) return false;

    let incoming: Uint8Array;
    try {
      incoming = parseEd25519PublicKey(key);
    } catch {
      return false;
    }

    for (const entry of keys) {
      const onChain = entry.public_key?.trim();
      if (!onChain) continue;
      if (onChain === key) return true;
      try {
        const rpcBytes = parseEd25519PublicKey(onChain);
        if (
          rpcBytes.length === incoming.length &&
          rpcBytes.every((b, i) => b === incoming[i])
        ) {
          return true;
        }
      } catch {
        // skip malformed RPC keys
      }
    }
    return false;
  } catch (error) {
    if (isUnknownAccessKeyError(error)) return false;
    throw error;
  }
}

/** Read on-chain function-call key limits for session metadata. */
export async function viewFunctionCallAccessKey(
  accountId: string,
  publicKey: string
): Promise<{
  receiverId: string;
  methodNames: string[];
  allowanceYocto: string | null;
} | null> {
  const rpc = getRpc();
  let permission: ViewAccessKeyPermission | undefined;

  try {
    const res = await rpc.call<{
      permission?: ViewAccessKeyPermission;
    }>('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: accountId,
      public_key: publicKey,
    });

    if (res.error) {
      if (isUnknownAccessKeyError(res.error)) return null;
      throw new Error(
        typeof res.error.message === 'string'
          ? res.error.message
          : 'NEAR access key query failed'
      );
    }

    permission = res.result?.permission;
  } catch (error) {
    if (isUnknownAccessKeyError(error)) return null;
    throw error;
  }

  if (!permission || permission === 'FullAccess') {
    return null;
  }

  const functionCall = permission.FunctionCall;
  if (!functionCall?.receiver_id) {
    return null;
  }

  const allowance = functionCall.allowance;
  return {
    receiverId: functionCall.receiver_id,
    methodNames: functionCall.method_names ?? [],
    allowanceYocto:
      allowance === undefined || allowance === null || allowance === ''
        ? null
        : String(allowance),
  };
}
