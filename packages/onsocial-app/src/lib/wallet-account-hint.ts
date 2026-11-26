/**
 * SSR hint for the last painted wallet account id.
 * Not auth — Collectibles href / hold peek on hard refresh only.
 * Kept in sync with `APP_WALLET_ACCOUNT_KEY` localStorage.
 */

export const APP_WALLET_ACCOUNT_HINT_COOKIE = 'os-wallet-account';

const ACCOUNT_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
/** Long-lived like localStorage; cleared on disconnect. */
const HINT_MAX_AGE_SEC = 60 * 60 * 24 * 400;

/** Validate / normalize a stored or cookie wallet account id. */
export function parseWalletAccountHint(
  value: string | null | undefined
): string | null {
  const id = value?.trim().toLowerCase() || '';
  if (!id || !ACCOUNT_ID.test(id)) return null;
  return id;
}

/** Read the hint from a `cookies().get` value (already decoded by Next). */
export function walletAccountHintFromCookie(
  value: string | null | undefined
): string | null {
  if (value == null || value === '') return null;
  try {
    return parseWalletAccountHint(decodeURIComponent(value));
  } catch {
    return parseWalletAccountHint(value);
  }
}

/** Write or clear the hint cookie beside localStorage wallet id. */
export function writeWalletAccountHintCookie(
  accountId: string | null | undefined
): void {
  if (typeof document === 'undefined') return;
  const id = parseWalletAccountHint(accountId);
  if (id) {
    document.cookie = `${APP_WALLET_ACCOUNT_HINT_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${HINT_MAX_AGE_SEC}; SameSite=Lax`;
    return;
  }
  document.cookie = `${APP_WALLET_ACCOUNT_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
