import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

const RPC_URL =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://rpc.mainnet.near.org'
    : 'https://rpc.testnet.near.org';

interface FunctionCallPermission {
  FunctionCall?: {
    receiver_id?: string;
    method_names?: string[];
    allowance?: string | null;
  };
}

export async function viewFunctionCallAccessKey(
  accountId: string,
  publicKey: string
): Promise<{
  receiverId: string;
  methodNames: string[];
  allowanceYocto: string | null;
} | null> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial-app',
      method: 'query',
      params: {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: accountId,
        public_key: publicKey,
      },
    }),
  });

  const payload = (await response.json()) as {
    result?: { permission?: FunctionCallPermission | 'FullAccess' };
  };

  const permission = payload.result?.permission;
  if (!permission || permission === 'FullAccess') {
    return null;
  }

  const functionCall = permission.FunctionCall;
  if (!functionCall?.receiver_id) {
    return null;
  }

  return {
    receiverId: functionCall.receiver_id,
    methodNames: functionCall.method_names ?? [],
    allowanceYocto: functionCall.allowance ?? null,
  };
}
