import { ACTIVE_BACKEND_URL, GOVERNANCE_WALLETS } from '@/lib/portal-config';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function parseWalletList(value: string): string[] {
  return value
    .split(',')
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);
}

/** Server-only: GSM `ADMIN_WALLETS`, with governance list fallback for local dev. */
export function getPortalSeasonAdminWallets(): string[] {
  const configured = process.env.ADMIN_WALLETS?.trim();
  if (configured) return parseWalletList(configured);
  return GOVERNANCE_WALLETS;
}

export function normalizeSeasonAdminAccountId(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

export function isPortalSeasonAdmin(
  accountId: string | null | undefined
): boolean {
  const normalized = normalizeSeasonAdminAccountId(accountId);
  if (!normalized) return false;
  return getPortalSeasonAdminWallets().includes(normalized);
}

function getSeasonSettlementAdminKey(): string | undefined {
  const key =
    process.env.SEASON_SETTLEMENT_ADMIN_KEY?.trim() ||
    process.env.ONSOCIAL_SEASON_ADMIN_KEY?.trim();
  return key || undefined;
}

export async function forwardSeasonAdminRequest(
  path: string,
  body: Record<string, unknown> = {}
): Promise<Response> {
  const adminKey = getSeasonSettlementAdminKey();
  if (!adminKey) {
    return Response.json(
      {
        success: false,
        error:
          'SEASON_SETTLEMENT_ADMIN_KEY is not configured on the portal server',
      },
      { status: 503 }
    );
  }

  const base = (process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL).replace(
    /\/$/,
    ''
  );
  const targetUrl = `${base}/v1/seasons/${path}`;

  return fetch(targetUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify(body),
  });
}
