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
 *
 * Prefer attaching a social session (delegate relay). When `wallet` is passed
 * (no session), `defaultBroadcast` is wallet mode so core writes still work
 * after the user removed App access — one wallet confirm per action.
 * Call sites should use `useAppOnSocialClient().getClient()` and not re-gate
 * on session for core contract actions.
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
                    gas: String(action.gas ?? '300000000000000'),
                    deposit: String(action.deposit ?? '0'),
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
