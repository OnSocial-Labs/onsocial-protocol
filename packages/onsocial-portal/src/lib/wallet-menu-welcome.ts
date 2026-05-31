const WALLET_MENU_SEEN_KEY = 'onsocial.portal.walletMenuSeen';

export type WalletMenuWelcomeLabel = 'Welcome' | 'Welcome back';

function readSeenAccounts(): Record<string, true> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WALLET_MENU_SEEN_KEY) ?? '{}'
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, seen]) => seen === true)
    ) as Record<string, true>;
  } catch {
    return {};
  }
}

export function walletMenuWelcomeLabel(
  accountId: string
): WalletMenuWelcomeLabel {
  return readSeenAccounts()[accountId] ? 'Welcome back' : 'Welcome';
}

export function markWalletMenuSeen(accountId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const seen = readSeenAccounts();
    seen[accountId] = true;
    window.localStorage.setItem(WALLET_MENU_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage unavailable — greeting falls back to Welcome each time.
  }
}
