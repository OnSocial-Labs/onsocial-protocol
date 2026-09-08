/**
 * Playwright paint wallet. Real production deploys never set
 * `NEXT_PUBLIC_E2E_WALLET`, so the localStorage seed stays inert there.
 * CI `next start` sets the flag at build time so holder / owner smokes work.
 */
export const E2E_WALLET_ACCOUNT_KEY = 'onsocial.e2e.accountId';

export function e2eWalletPaintAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_E2E_WALLET === '1'
  );
}

export function readE2eWalletAccountId(): string | null {
  if (!e2eWalletPaintAllowed()) return null;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(E2E_WALLET_ACCOUNT_KEY)?.trim() || null;
  } catch {
    return null;
  }
}
