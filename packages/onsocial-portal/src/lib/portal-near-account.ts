import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { isValidPortalAccountId } from '@/lib/portal-profile-server';

/** User-creatable NEAR root suffixes on the active network. */
export const NEAR_ACCOUNT_ROOT_SUFFIXES =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? (['near', 'tg'] as const)
    : (['testnet'] as const);

export function sanitizeNearAccountInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function normalizeNearAccountId(value: string): string {
  return sanitizeNearAccountInput(value).trim();
}

/** True when the id has a complete named-account suffix for the active network. */
export function isNearNamedAccountComplete(accountId: string): boolean {
  const normalized = normalizeNearAccountId(accountId);
  if (!normalized || !isValidPortalAccountId(normalized)) {
    return false;
  }

  return NEAR_ACCOUNT_ROOT_SUFFIXES.some((suffix) =>
    normalized.endsWith(`.${suffix}`)
  );
}

export function nearAccountSuffixHint(): string {
  if (ACTIVE_NEAR_NETWORK === 'mainnet') {
    return '.near or .tg';
  }

  return '.testnet';
}

export function nearAccountPlaceholder(): string {
  if (ACTIVE_NEAR_NETWORK === 'mainnet') {
    return 'account.near';
  }

  return 'account.testnet';
}
