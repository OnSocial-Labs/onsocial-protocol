import { normalizeAmountInput } from '@onsocial/ui';
import {
  isNearNamedAccountComplete,
  isValidNearAccountId,
  nearAccountSuffixHint,
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

/** Parent must be a named root account (.near / .tg on mainnet, .testnet on testnet). */
export function getFtParentAccountError(
  parentAccountId: string | null | undefined
): string {
  const parent = normalizeNearAccountId(parentAccountId ?? '');
  if (!parent) return 'Connect a wallet first.';
  if (!isValidNearAccountId(parent) || !isNearNamedAccountComplete(parent)) {
    return `Create tokens from a named account (${nearAccountSuffixHint()}).`;
  }
  return '';
}

export function getFtContractAccountError(
  parentAccountId: string,
  subaccountLabel: string
): string {
  const parentError = getFtParentAccountError(parentAccountId);
  if (parentError) return parentError;
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

/** 1 quadrillion tokens — generous cap that keeps smallest units inside u128. */
export const FT_SUPPLY_MAX_TOKENS = 1_000_000_000_000_000n;

/**
 * Supply validation with specific copy. Over-cap supplies would panic the
 * contract's U128 arg parse on-chain — catch them at the form instead.
 */
export function getFtSupplyError(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const smallest = parseFtSupplySmallest(trimmed);
  if (!smallest) return 'Enter a total supply greater than zero.';
  try {
    const cap = FT_SUPPLY_MAX_TOKENS * 10n ** BigInt(FT_TOKEN_DECIMALS);
    if (BigInt(smallest) > cap) return 'Supply is too large.';
  } catch {
    return 'Enter a valid supply.';
  }
  return '';
}

/** Tickers are uppercase letters/numbers only — no emoji, spaces, punctuation. */
export function normalizeFtSymbol(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, FT_SYMBOL_MAX);
}

/** Display name — strip control chars; spaces and unicode stay. */
export function normalizeFtName(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, FT_NAME_MAX);
}

/** Whole-token supply while typing — digits only, capped below u128 overflow. */
export function normalizeFtSupplyInput(value: string): string {
  const digits = normalizeAmountInput(value, 0);
  if (!digits) return '';
  const maxDigits = String(FT_SUPPLY_MAX_TOKENS).length;
  return digits.length > maxDigits ? digits.slice(0, maxDigits) : digits;
}

/** On-chain icon lives in metadata — keep the data URL tiny. */
export const FT_ICON_PX = 64;
export const FT_ICON_MAX_DATA_URL = 12_000;
export const FT_ICON_ACCEPT = 'image/png,image/jpeg,image/webp';

/** Compact data-URL icon from ticker (keeps deploy state small). */
export function defaultFtIconDataUrl(symbol: string): string {
  const letters = (symbol.trim() || 'FT')
    .slice(0, 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '·');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#111"/><text x="32" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#fff">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const FT_SYSTEM_OWNER = 'system';

export function isFtAdminLocked(ownerId: string | null | undefined): boolean {
  const owner = (ownerId ?? '').trim().toLowerCase();
  return !owner || owner === FT_SYSTEM_OWNER;
}

export function isFtAdminFor(
  ownerId: string | null | undefined,
  accountId: string | null | undefined
): boolean {
  if (isFtAdminLocked(ownerId)) return false;
  return (
    (ownerId ?? '').trim().toLowerCase() ===
    (accountId ?? '').trim().toLowerCase()
  );
}

export function getFtIconError(dataUrl: string): string {
  const trimmed = dataUrl.trim();
  if (!trimmed) return 'Add an icon.';
  if (!trimmed.startsWith('data:image/')) return 'Use a PNG or JPEG.';
  if (trimmed.length > FT_ICON_MAX_DATA_URL) return 'Use a smaller image.';
  return '';
}
