import 'server-only';

import type { NearRpcResponse } from '@onsocial/rpc';
import { resolveFtTemplateIdentifier } from '@/lib/app-ft-template-config';
import { FT_FACTORY_NOT_READY } from '@/lib/ft-factory-copy';
import type { FtFactoryFinishInput } from '@/lib/ft-factory-client';
import {
  factoryKeyFromSecret,
  finishCreatorToken,
  type FactoryRpc,
  type FinishCreatorTokenResult,
} from '@/server/ft-factory-tx';
import { getActiveServerNearRpc } from '@/server/near-rpc-bff';

function rpcErrorMessage(error: NonNullable<NearRpcResponse['error']>): string {
  const data = error.data;
  const dataText =
    typeof data === 'string' ? data : data ? JSON.stringify(data) : '';
  const cause = error.cause?.name ?? '';
  return [error.message, cause, dataText].filter(Boolean).join(': ');
}

function serverFactoryRpc(): FactoryRpc {
  const rpc = getActiveServerNearRpc();
  return {
    async call<T>(method: string, params: unknown): Promise<T> {
      const response = await rpc.call<T>(method, params);
      if (response.error) {
        throw new Error(rpcErrorMessage(response.error));
      }
      if (response.result === undefined) {
        throw new Error('NEAR RPC returned no result');
      }
      return response.result;
    },
  };
}

/** Public half of `FT_FACTORY_SECRET_KEY`. Null when the server cannot finish. */
export function readFactoryPublicKey(): string | null {
  return (
    factoryKeyFromSecret(process.env.FT_FACTORY_SECRET_KEY ?? '')?.publicKey ??
    null
  );
}

export async function runFactoryFinish(
  input: FtFactoryFinishInput
): Promise<FinishCreatorTokenResult> {
  const key = factoryKeyFromSecret(process.env.FT_FACTORY_SECRET_KEY ?? '');
  if (!key) {
    return {
      ok: false,
      error: FT_FACTORY_NOT_READY,
      retryable: false,
      code: 'not-ready',
    };
  }
  return finishCreatorToken(input, {
    rpc: serverFactoryRpc(),
    secretKey: key.secretKey,
    template: resolveFtTemplateIdentifier(),
  });
}
