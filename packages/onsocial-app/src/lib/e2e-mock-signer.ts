import type { NearWalletBase } from '@hot-labs/near-connect';
import { e2eWalletPaintAllowed } from '@/lib/e2e-wallet-account';

/** Keep in sync with Playwright `seedE2eMockSigner`. */
export const E2E_MOCK_SIGNER_KEY = 'onsocial.e2e.mockSigner';

/** Thrown after recording so nothing hits the chain. */
export const E2E_MOCK_SIGNER_ERROR = 'E2E mock signer — not broadcast';

export type E2eMockSignerCall = {
  receiverId: string;
  methodName: string;
  args: unknown;
};

declare global {
  interface Window {
    __onsocialE2eSignerCalls?: E2eMockSignerCall[];
  }
}

export function readE2eMockSignerEnabled(): boolean {
  if (!e2eWalletPaintAllowed()) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(E2E_MOCK_SIGNER_KEY) === '1';
  } catch {
    return false;
  }
}

function recordCall(call: E2eMockSignerCall): void {
  if (typeof window === 'undefined') return;
  const next = window.__onsocialE2eSignerCalls ?? [];
  next.push(call);
  window.__onsocialE2eSignerCalls = next;
}

function actionCalls(
  actions: ReadonlyArray<{
    type?: string;
    params?: { methodName?: string; args?: unknown };
    methodName?: string;
    args?: unknown;
  }>
): E2eMockSignerCall[] {
  return actions.map((action) => ({
    receiverId: '',
    methodName: String(action.params?.methodName ?? action.methodName ?? ''),
    args: action.params?.args ?? action.args ?? null,
  }));
}

/**
 * Paint-only wallet. Records FunctionCalls, then throws so Playwright can
 * assert the intended write without spending testnet NEAR.
 */
export function createE2eMockWallet(accountId: string): NearWalletBase {
  const signerId = accountId.trim();
  return {
    async getAccounts() {
      return [{ accountId: signerId }];
    },
    async signAndSendTransaction(params: {
      receiverId?: string;
      actions?: ReadonlyArray<{
        type?: string;
        params?: { methodName?: string; args?: unknown };
        methodName?: string;
        args?: unknown;
      }>;
    }) {
      const receiverId = String(params.receiverId ?? '');
      for (const call of actionCalls(params.actions ?? [])) {
        recordCall({ ...call, receiverId });
      }
      throw new Error(E2E_MOCK_SIGNER_ERROR);
    },
    async signAndSendTransactions(params: {
      transactions?: ReadonlyArray<{
        receiverId?: string;
        actions?: ReadonlyArray<{
          type?: string;
          params?: { methodName?: string; args?: unknown };
          methodName?: string;
          args?: unknown;
        }>;
      }>;
    }) {
      for (const tx of params.transactions ?? []) {
        const receiverId = String(tx.receiverId ?? '');
        for (const call of actionCalls(tx.actions ?? [])) {
          recordCall({ ...call, receiverId });
        }
      }
      throw new Error(E2E_MOCK_SIGNER_ERROR);
    },
  } as unknown as NearWalletBase;
}
