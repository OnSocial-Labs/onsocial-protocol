import {
  createConfiguredNearRpc,
  type NearRpc,
  type Network,
} from '@onsocial/rpc';
import { config } from '../config/index.js';

let nearRpc: NearRpc | null = null;

function getNearNetwork(): Network {
  return config.nearNetwork === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getBackendNearRpc(): NearRpc {
  if (!nearRpc) {
    nearRpc = createConfiguredNearRpc({
      network: getNearNetwork(),
      publicOnly: false,
      primaryUrl: config.nearRpcUrl,
      timeoutMs: 10_000,
      maxRetries: 1,
    });
  }

  return nearRpc;
}

export async function nearQueryCallFunctionRaw(
  accountId: string,
  methodName: string,
  args: object,
  blockId?: number
): Promise<string> {
  const response = await getBackendNearRpc().call<{ result: number[] }>(
    'query',
    {
      request_type: 'call_function',
      ...(blockId != null ? { block_id: blockId } : { finality: 'final' }),
      account_id: accountId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    }
  );

  if (response.error || !response.result?.result) {
    throw new Error(
      `RPC error calling ${methodName}: ${JSON.stringify(response.error)}`
    );
  }

  return Buffer.from(response.result.result).toString();
}
