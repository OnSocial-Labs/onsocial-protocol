import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

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

export function isValidNearAccountId(accountId: string): boolean {
  return ACCOUNT_ID_PATTERN.test(accountId);
}

export function nearAccountSuffixHint(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet' ? '.near or .tg' : '.testnet';
}

export function nearAccountPlaceholder(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet' ? 'account.near' : 'account.testnet';
}

export function isNearNamedAccountComplete(accountId: string): boolean {
  const normalized = normalizeNearAccountId(accountId);
  if (!normalized || !isValidNearAccountId(normalized)) {
    return false;
  }

  return NEAR_ACCOUNT_ROOT_SUFFIXES.some((suffix) =>
    normalized.endsWith(`.${suffix}`)
  );
}

export function getNearAccountInputError(value: string): string {
  const normalized = normalizeNearAccountId(value);
  if (!normalized) {
    return '';
  }

  if (!isValidNearAccountId(normalized)) {
    return 'Use lowercase letters, numbers, dots, dashes, and underscores only.';
  }

  if (!isNearNamedAccountComplete(normalized)) {
    return `Use a complete NEAR account (${nearAccountSuffixHint()}).`;
  }

  return '';
}

export function isNearAccountInputReady(value: string): boolean {
  const normalized = normalizeNearAccountId(value);
  return Boolean(normalized) && !getNearAccountInputError(value);
}
