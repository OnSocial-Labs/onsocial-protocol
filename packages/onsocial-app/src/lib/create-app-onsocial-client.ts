import { OnSocial } from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';

function extractTxHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.txHash === 'string') return obj.txHash;
  if (typeof obj.hash === 'string') return obj.hash;

  const transaction = obj.transaction;
  if (transaction && typeof transaction === 'object') {
    const hash = (transaction as Record<string, unknown>).hash;
    if (typeof hash === 'string') return hash;
  }

  const raw = obj.raw;
  if (raw && raw !== value) return extractTxHash(raw);

  return undefined;
}

/**
 * Browser OnSocial client for page writes.
 * Prefer attaching a social session (delegate relay). Pass wallet only as fallback.
 */
export function createAppOnSocialClient(
  accountId: string,
  wallet?: NearWalletBase
): OnSocial {
  return new OnSocial({
    network: ACTIVE_NEAR_NETWORK,
    gatewayUrl: BROWSER_GATEWAY_PROXY,
    actorId: accountId,
    ...(wallet
      ? {
          defaultBroadcast: {
            kind: 'wallet' as const,
            signer: async ({ receiverId, actions }) => {
              const result = await wallet.signAndSendTransaction({
                network: ACTIVE_NEAR_NETWORK,
                signerId: accountId,
                receiverId,
                actions: actions.map((action) => ({
                  type: 'FunctionCall',
                  params: {
                    methodName: action.methodName,
                    args: action.args,
                    gas: action.gas,
                    deposit: action.deposit,
                  },
                })),
              });

              const txHash = extractTxHash(result);
              const raw = result as unknown as Record<string, unknown>;
              return txHash ? { txHash, raw } : { raw };
            },
          },
        }
      : {}),
  });
}
