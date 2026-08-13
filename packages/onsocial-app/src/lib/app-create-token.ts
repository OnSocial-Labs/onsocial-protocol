import {
  isValidNearAccountId,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { tokenAmountToSmallestUnit } from '@/lib/app-near-rpc';
import { FT_TOKEN_DECIMALS } from '@/lib/app-ft-template-config';

export const FT_SUBACCOUNT_MIN = 2;
export const FT_SUBACCOUNT_MAX = 32;
export const FT_NAME_MAX = 64;
export const FT_SYMBOL_MAX = 12;
export const FT_ACCOUNT_MAX = 64;

const SUBACCOUNT_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;

/** Lowercase subaccount label (flexible — not forced to `token`). */
export function normalizeFtSubaccountLabel(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FT_SUBACCOUNT_MAX);
}

export function buildFtContractAccountId(
  parentAccountId: string,
  subaccountLabel: string
): string {
  const parent = normalizeNearAccountId(parentAccountId);
  const label = normalizeFtSubaccountLabel(subaccountLabel);
  if (!parent || !label) return '';
  return `${label}.${parent}`;
}

export function getFtSubaccountLabelError(label: string): string {
  const normalized = normalizeFtSubaccountLabel(label);
  if (!normalized) return '';
  if (normalized.length < FT_SUBACCOUNT_MIN) {
    return `Use at least ${FT_SUBACCOUNT_MIN} characters.`;
  }
  if (!SUBACCOUNT_PATTERN.test(normalized)) {
    return 'Use lowercase letters, numbers, underscores, or hyphens.';
  }
  return '';
}

export function getFtContractAccountError(
  parentAccountId: string,
  subaccountLabel: string
): string {
  const labelError = getFtSubaccountLabelError(subaccountLabel);
  if (labelError) return labelError;
  const accountId = buildFtContractAccountId(parentAccountId, subaccountLabel);
  if (!accountId) return 'Connect a wallet first.';
  if (accountId.length > FT_ACCOUNT_MAX) {
    return 'That account id is too long — shorten the name.';
  }
  if (!isValidNearAccountId(accountId)) {
    return 'That account id is not valid on NEAR.';
  }
  return '';
}

/** Human supply → 18-decimal smallest units. */
export function parseFtSupplySmallest(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const smallest = tokenAmountToSmallestUnit(trimmed, FT_TOKEN_DECIMALS);
    if (!smallest || smallest === '0') return null;
    return smallest;
  } catch {
    return null;
  }
}

/** Compact data-URL icon from ticker (keeps deploy state small). */
export function defaultFtIconDataUrl(symbol: string): string {
  const letters = (symbol.trim() || 'FT')
    .slice(0, 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '·');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#111"/><text x="32" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#fff">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
