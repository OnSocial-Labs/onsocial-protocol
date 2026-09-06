/**
 * Dev / Playwright only. Production builds never read this key.
 * Lets drop-page e2e seed a connected account without NearConnector.
 */
export const E2E_WALLET_ACCOUNT_KEY = 'onsocial.e2e.accountId';

export function readE2eWalletAccountId(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(E2E_WALLET_ACCOUNT_KEY)?.trim() || null;
  } catch {
    return null;
  }
}
