import type { NearWalletBase } from '@hot-labs/near-connect';
import { e2eWalletPaintAllowed } from '@/lib/e2e-wallet-account';

/** Keep in sync with Playwright `seedE2eMockSigner`. */
export const E2E_MOCK_SIGNER_KEY = 'onsocial.e2e.mockSigner';
export const E2E_AUTH_SESSION_KEY = 'onsocial.e2e.authSession';
/** Record the write and resolve, so a sheet can close without a chain broadcast. */
export const E2E_MOCK_SIGNER_SUCCESS_KEY = 'onsocial.e2e.mockSignerSuccess';
/** First-visit connect harness. Does not paint an already-connected account. */
export const E2E_FIRST_CONNECT_KEY = 'onsocial.e2e.firstConnect';
export const E2E_FIRST_CONNECT_ACCOUNT_KEY = 'onsocial.e2e.firstConnectAccount';

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

export function readE2eFirstConnectEnabled(): boolean {
  if (!e2eWalletPaintAllowed()) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(E2E_FIRST_CONNECT_KEY) === '1';
  } catch {
    return false;
  }
}

function readE2eFirstConnectAccount(): string {
  try {
    return (
      window.localStorage.getItem(E2E_FIRST_CONNECT_ACCOUNT_KEY)?.trim() ||
      'alice.testnet'
    );
  } catch {
    return 'alice.testnet';
  }
}

export function readE2eAuthSessionEnabled(): boolean {
  if (!e2eWalletPaintAllowed()) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(E2E_AUTH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function mockSignerShouldSucceed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(E2E_MOCK_SIGNER_SUCCESS_KEY) === '1';
  } catch {
    return false;
  }
}

function finishMockSend(): { transaction: { hash: string } } {
  if (mockSignerShouldSucceed()) {
    return { transaction: { hash: 'e2e-mock-tx' } };
  }
  throw new Error(E2E_MOCK_SIGNER_ERROR);
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
      return finishMockSend();
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
      return finishMockSend();
    },
  } as unknown as NearWalletBase;
}

type E2eSignInHandler = (event: {
  accounts: Array<{ accountId: string }>;
  wallet: NearWalletBase;
  success: boolean;
}) => void;

function waitForE2eSignInApproval(bundled: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Sign in');
    dialog.dataset.appAccess = bundled ? 'yes' : 'no';
    dialog.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;gap:0.75rem;background:Canvas;color:CanvasText;';
    const title = document.createElement('p');
    title.textContent = 'Sign in';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const close = () => dialog.remove();
    approve.addEventListener('click', () => {
      if (bundled) {
        document.cookie = 'onsocial_e2e_key=1; path=/';
      }
      close();
      resolve();
    });
    cancel.addEventListener('click', () => {
      close();
      reject(new Error('User rejected'));
    });
    dialog.append(title, approve, cancel);
    document.body.append(dialog);
  });
}

/**
 * Stand-in for near-connect on a first visit. The picker resolves at once.
 * Each sign-in paints one dialog the test can count.
 */
export function createE2eFirstConnectConnector() {
  const listeners = new Set<E2eSignInHandler>();
  const onceWrappers = new Map<E2eSignInHandler, E2eSignInHandler>();
  const accountId = readE2eFirstConnectAccount();
  let signedIn: NearWalletBase | null = null;

  const preview = {
    manifest: {
      id: 'e2e',
      features: { signInWithFunctionCallKey: true },
    },
    async getAccounts() {
      return [{ accountId }];
    },
    async signIn() {
      return [{ accountId }];
    },
  };

  return {
    on(event: string, handler: E2eSignInHandler) {
      if (event === 'wallet:signIn') listeners.add(handler);
    },
    once(event: string, handler: E2eSignInHandler) {
      if (event !== 'wallet:signIn') return;
      const wrapped: E2eSignInHandler = (payload) => {
        listeners.delete(wrapped);
        onceWrappers.delete(handler);
        handler(payload);
      };
      onceWrappers.set(handler, wrapped);
      listeners.add(wrapped);
    },
    off(event: string, handler: E2eSignInHandler) {
      if (event !== 'wallet:signIn') return;
      const wrapped = onceWrappers.get(handler);
      if (wrapped) {
        listeners.delete(wrapped);
        onceWrappers.delete(handler);
      }
      listeners.delete(handler);
    },
    removeAllListeners() {
      listeners.clear();
      onceWrappers.clear();
    },
    async selectWallet() {
      return 'e2e';
    },
    async wallet() {
      return preview;
    },
    async getConnectedWallet() {
      if (!signedIn) throw new Error('No wallet selected');
      return { wallet: signedIn, accounts: [{ accountId }] };
    },
    async disconnect() {
      signedIn = null;
    },
    async connect(input?: { addFunctionCallKey?: unknown }) {
      const bundled = input?.addFunctionCallKey != null;
      await waitForE2eSignInApproval(bundled);
      const wallet = createE2eMockWallet(accountId);
      signedIn = wallet;
      const event = {
        accounts: [{ accountId }],
        wallet,
        success: true,
      };
      for (const handler of [...listeners]) handler(event);
      return wallet;
    },
  };
}
