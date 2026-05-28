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
