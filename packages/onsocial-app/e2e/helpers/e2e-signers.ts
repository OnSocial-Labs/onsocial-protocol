/**
 * Env signers for Playwright. Account ids only — keys stay in integration
 * helpers (`scripts/e2e-signers.mjs`). Cloud secrets are named TICKET_E2E_*
 * but any spec that needs a real account can use them.
 *
 * Keep names in sync with `scripts/e2e-signers.mjs`.
 */

export type E2eSignerRole = 'primary' | 'counterparty';

function envTrim(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
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

/** Paint a connected wallet when a real signer account is in env. */
export function e2ePaintAccountId(fallback: string): string {
  return resolveE2eSignerAccount('primary') || fallback;
}
