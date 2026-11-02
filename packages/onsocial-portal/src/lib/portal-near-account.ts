import {
  readPortalNetwork,
  type PortalNearNetwork,
} from '@/lib/portal-network';
import { isValidPortalAccountId } from '@/lib/portal-profile-server';

/** User-creatable NEAR root suffixes on the selected network. */
export function nearAccountRootSuffixes(
  network: PortalNearNetwork = readPortalNetwork()
): readonly ['near', 'tg'] | readonly ['testnet'] {
  return network === 'mainnet'
    ? (['near', 'tg'] as const)
    : (['testnet'] as const);
}

export function sanitizeNearAccountInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function normalizeNearAccountId(value: string): string {
  return sanitizeNearAccountInput(value).trim();
}

/** True when the id has a complete named-account suffix for the active network. */
export function isNearNamedAccountComplete(
  accountId: string,
  network: PortalNearNetwork = readPortalNetwork()
): boolean {
  const normalized = normalizeNearAccountId(accountId);
  if (!normalized || !isValidPortalAccountId(normalized)) {
    return false;
  }

  return nearAccountRootSuffixes(network).some((suffix) =>
    normalized.endsWith(`.${suffix}`)
  );
}

export function nearAccountSuffixHint(
  network: PortalNearNetwork = readPortalNetwork()
): string {
  if (network === 'mainnet') {
    return '.near or .tg';
  }

  return '.testnet';
}

export function nearAccountPlaceholder(
  network: PortalNearNetwork = readPortalNetwork()
): string {
  if (network === 'mainnet') {
    return 'account.near';
  }

  return 'account.testnet';
}

export function getNearAccountInputError(
  value: string,
  network: PortalNearNetwork = readPortalNetwork()
): string {
  const normalized = normalizeNearAccountId(value);
  if (!normalized) {
    return '';
  }

  if (!isValidPortalAccountId(normalized)) {
    return 'Use lowercase letters, numbers, dots, dashes, and underscores only';
  }

  if (!isNearNamedAccountComplete(normalized, network)) {
    return `Use a complete NEAR account (${nearAccountSuffixHint(network)})`;
  }

  return '';
}

export function isNearAccountInputReady(
  value: string,
  network: PortalNearNetwork = readPortalNetwork()
): boolean {
  const normalized = normalizeNearAccountId(value);
  return Boolean(normalized) && !getNearAccountInputError(value, network);
}
