import {
  createBffNearRpcClient,
  createConfiguredNearRpc,
  resolveNearRpcBffEndpoint,
  type NearRpc,
} from '@onsocial/rpc';
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
