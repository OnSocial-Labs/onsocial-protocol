import { accountIdsEqual } from '@/lib/account-match';
import {
  isValidNearAccountId,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { FT_TOKEN_DECIMALS } from '@/lib/app-ft-template-config';
import { tokenAmountToSmallestUnit } from '@/lib/app-near-rpc';

/** One signature stays under the 300 TGas prepaid cap. */
export const THANK_TOKEN_RECIPIENT_CAP = 10;

export const THANK_TOKEN_MEMO = 'Thanks';

/** Standard NEP-141 registration floor (~0.00125 NEAR). */
export const THANK_TOKEN_STORAGE_FLOOR_YOCTO = '1250000000000000000000';

/** Leave NEAR for gas after storage deposits. ~0.01 NEAR. */
export const THANK_TOKEN_GAS_RESERVE_YOCTO = 10_000_000_000_000_000_000_000n;

export function normalizeThankRecipientId(value: string): string {
  return normalizeNearAccountId(value);
}

/** Valid unique recipients, never the sender. Order preserved. */
export function normalizeThankRecipientIds(
  ids: readonly string[],
  senderId: string
): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of ids) {
    const id = normalizeThankRecipientId(raw);
    if (!id || !isValidNearAccountId(id)) continue;
    if (accountIdsEqual(id, senderId)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function toggleThankRecipient(
  selected: readonly string[],
  accountId: string,
  senderId: string,
  cap = THANK_TOKEN_RECIPIENT_CAP
): { next: string[]; blocked: boolean } {
  const id = normalizeThankRecipientId(accountId);
  const current = normalizeThankRecipientIds(selected, senderId);
  if (!id || accountIdsEqual(id, senderId)) {
    return { next: current, blocked: false };
  }
  if (current.includes(id)) {
    return { next: current.filter((row) => row !== id), blocked: false };
  }
  if (current.length >= cap) {
    return { next: current, blocked: true };
  }
  return { next: [...current, id], blocked: false };
}

/** Creator template is 18; recovered / added tokens keep their NEP-141 decimals. */
export function resolveThankDecimals(decimals?: number | null): number {
  if (
    typeof decimals === 'number' &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 24
  ) {
    return decimals;
  }
  return FT_TOKEN_DECIMALS;
}

export function parseThankAmountSmallest(
  input: string,
  decimals: number = FT_TOKEN_DECIMALS
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const smallest = tokenAmountToSmallestUnit(
      trimmed,
      resolveThankDecimals(decimals)
    );
    if (!smallest || smallest === '0') return null;
    return smallest;
  } catch {
    return null;
  }
}

export function getThankAmountError(
  input: string,
  decimals: number = FT_TOKEN_DECIMALS
): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const smallest = parseThankAmountSmallest(trimmed, decimals);
  if (!smallest) return 'Enter an amount greater than zero.';
  return '';
}

export function getThankRecipientError(
  ids: readonly string[],
  senderId: string,
  cap = THANK_TOKEN_RECIPIENT_CAP
): string {
  const recipients = normalizeThankRecipientIds(ids, senderId);
  if (recipients.length === 0) {
    return 'Pick someone who stands with you.';
  }
  if (recipients.length > cap) {
    return `Thank up to ${cap} people at a time.`;
  }
  return '';
}

export function thankTotalSmallest(
  amountSmallest: string,
  count: number
): bigint {
  if (count <= 0) return 0n;
  return BigInt(amountSmallest) * BigInt(count);
}

export function getThankBalanceError(
  balanceSmallest: bigint,
  totalSmallest: bigint,
  symbol: string
): string {
  if (totalSmallest <= 0n) return '';
  if (balanceSmallest >= totalSmallest) return '';
  const ticker = symbol.trim() || 'tokens';
  return `Not enough ${ticker}.`;
}

export function resolveThankStorageDeposit(boundsMin: string | null): string {
  let contractMin = 0n;
  if (boundsMin) {
    try {
      contractMin = BigInt(boundsMin);
    } catch {
      contractMin = 0n;
    }
  }
  const floor = BigInt(THANK_TOKEN_STORAGE_FLOOR_YOCTO);
  return (contractMin > floor ? contractMin : floor).toString();
}

export function isThankStorageRegistered(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const total = (value as { total?: unknown }).total;
  if (typeof total !== 'string' && typeof total !== 'number') return false;
  try {
    return BigInt(total) > 0n;
  } catch {
    return false;
  }
}

export function thankStorageNearYocto(
  unregisteredCount: number,
  depositYocto: string
): bigint {
  if (unregisteredCount <= 0) return 0n;
  return BigInt(depositYocto) * BigInt(unregisteredCount);
}

export function getThankNearError(
  spendableYocto: bigint,
  unregisteredCount: number,
  depositYocto: string
): string {
  const needed =
    thankStorageNearYocto(unregisteredCount, depositYocto) +
    THANK_TOKEN_GAS_RESERVE_YOCTO;
  if (spendableYocto >= needed) return '';
  return 'Need a little NEAR for new wallets.';
}

export function formatThankAmount(
  smallest: string,
  decimals: number = FT_TOKEN_DECIMALS
): string {
  const raw = smallest.trim();
  if (!raw || raw === '0') return '0';
  const places = resolveThankDecimals(decimals);
  try {
    const digits = BigInt(raw).toString();
    const padded = digits.padStart(places + 1, '0');
    const whole = padded.slice(0, padded.length - places) || '0';
    const frac = padded.slice(padded.length - places).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  } catch {
    return '0';
  }
}
