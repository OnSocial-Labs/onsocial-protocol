const WALLET_SUFFIXES = ['.testnet', '.near', '.tg'] as const;

/** Short wallet label from a NEAR account id (e.g. voter2.onsocial.testnet → Voter2). */
export function walletLabelFromAccountId(accountId: string): string {
  let base = accountId.trim().toLowerCase();
  if (!base) return accountId;

  for (const suffix of WALLET_SUFFIXES) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }

  const root = base.split('.')[0] ?? base;
  if (!root) return accountId;

  return root.charAt(0).toUpperCase() + root.slice(1);
}

/** First token of profile name, or wallet label — for compact greetings. */
export function walletGreetingName(
  profileName: string | null | undefined,
  accountId: string
): string {
  const trimmed = profileName?.trim();
  if (trimmed) {
    const first = trimmed.split(/\s+/)[0];
    if (first) return first;
  }
  return walletLabelFromAccountId(accountId);
}
