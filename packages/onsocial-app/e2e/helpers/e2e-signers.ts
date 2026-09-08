/**
 * Env signers for Playwright. Account ids only — never return private keys
 * from this module. Key material stays in `scripts/e2e-signers.mjs`.
 *
 * Paint fixtures (`e2ePaintAccountId`, `e2ePortfolioAccountId`) stay on
 * explicit e2e accounts. Ticket / signer env is for signed journeys only —
 * do not let `TICKET_E2E_*` rewrite holder back-links or vault paths.
 *
 * Keep signer names in sync with `scripts/e2e-signers.mjs`.
 */

export type E2eSignerRole = 'primary' | 'counterparty';

function envTrim(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function envHas(name: string): boolean {
  return Boolean(envTrim(name));
}

export function resolveE2eSignerAccount(
  role: E2eSignerRole = 'primary'
): string | null {
  if (role === 'counterparty') {
    return (
      envTrim('E2E_COUNTERPARTY_ACCOUNT') ||
      envTrim('TICKET_E2E_BUYER_ACCOUNT') ||
      envTrim('SECONDARY_ACCOUNT_ID')
    );
  }
  return (
    envTrim('E2E_SIGNER_ACCOUNT') ||
    envTrim('TICKET_E2E_ORGANIZER_ACCOUNT') ||
    envTrim('ACCOUNT_ID') ||
    envTrim('TEST_ACCOUNT_ID')
  );
}

/**
 * True when a write journey can load both account + key env.
 * Does not return the key. App CI does not set these secrets.
 */
export function hasE2eSignerSecrets(role: E2eSignerRole = 'primary'): boolean {
  if (!resolveE2eSignerAccount(role)) return false;
  if (role === 'counterparty') {
    return (
      envHas('E2E_COUNTERPARTY_PRIVATE_KEY') ||
      envHas('TICKET_E2E_BUYER_PRIVATE_KEY') ||
      envHas('TEST_PRIVATE_KEY')
    );
  }
  return (
    envHas('E2E_SIGNER_PRIVATE_KEY') ||
    envHas('TICKET_E2E_ORGANIZER_PRIVATE_KEY') ||
    envHas('TEST_PRIVATE_KEY')
  );
}

/** Skip on-chain mint / stand / endorse writes unless signer secrets exist. */
export function skipUnlessE2eSigner(
  testFn: { skip: (condition?: boolean, description?: string) => void },
  role: E2eSignerRole = 'primary'
): void {
  testFn.skip(
    !hasE2eSignerSecrets(role),
    'Set E2E_SIGNER_ACCOUNT + E2E_SIGNER_PRIVATE_KEY (or TICKET_E2E_ORGANIZER_*) to run on-chain writes'
  );
}

/** Optional override for paint-only wallet seeds. Never reads ticket signers. */
export function e2ePaintAccountId(fallback: string): string {
  return envTrim('E2E_PAINT_ACCOUNT') || fallback;
}

/**
 * Live portfolio face for standing / drawer smokes.
 * `alice.testnet` is the maintained testnet fixture — not dormant greenghost.
 */
export function e2ePortfolioAccountId(): string {
  return envTrim('E2E_PORTFOLIO_ACCOUNT') || 'alice.testnet';
}
