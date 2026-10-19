import { OnSocial } from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';

function extractTxHash(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.txHash === 'string' && obj.txHash.trim()) return obj.txHash;
  if (typeof obj.hash === 'string' && obj.hash.trim()) return obj.hash;

  const transaction = obj.transaction;
  if (transaction && typeof transaction === 'object') {
    const hash = (transaction as Record<string, unknown>).hash;
    if (typeof hash === 'string' && hash.trim()) return hash;
  }

  const outcome = obj.transaction_outcome;
  if (outcome && typeof outcome === 'object') {
    const id = (outcome as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) return id;
  }

  if (Array.isArray(obj.transactions) && obj.transactions[0]) {
    const nested = extractTxHash(obj.transactions[0], depth + 1);
    if (nested) return nested;
  }

  const raw = obj.raw;
  if (raw && raw !== value) return extractTxHash(raw, depth + 1);

  return undefined;
}

function executionFailed(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  const obj = value as Record<string, unknown>;
  const status = obj.status;
  if (status && typeof status === 'object' && 'Failure' in status) return true;
  if (Array.isArray(obj.transactions) && obj.transactions[0]) {
    if (executionFailed(obj.transactions[0], depth + 1)) return true;
  }
  if (obj.raw && obj.raw !== value) return executionFailed(obj.raw, depth + 1);
  return false;
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

              if (executionFailed(result)) {
                throw new Error('Transaction reverted on-chain');
              }
              const txHash = extractTxHash(result);
              if (!txHash) throw new Error('Transaction did not send.');
              return { txHash, raw: result };
            },
          },
        }
      : {}),
  });
}
