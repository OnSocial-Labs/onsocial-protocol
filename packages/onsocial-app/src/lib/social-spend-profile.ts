import { finalizeAmountInput } from '@/lib/amount-input';
import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';
import { tokenAmountToSmallestUnit, viewNearContract } from '@/lib/app-near-rpc';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';

/**
 * Fallback routing for `support_profile` when chain config is unavailable
 * (1% protocol boost · 99% recipient).
 */
export const SUPPORT_PROFILE_TREASURY_BPS = 100;
export const SUPPORT_PROFILE_TARGET_BPS = 9_900;

/** Fallback minimum when chain config is unavailable (0.01 SOCIAL, 18 decimals). */
export const SUPPORT_PROFILE_MIN_YOCTO = 10_000_000_000_000_000n;

export const SUPPORT_PROFILE_MIN_SOCIAL_LABEL = '0.01';

export const SUPPORT_PROFILE_PRESET_SOCIAL = ['1', '5', '10'] as const;

/** Fractional digits while typing SOCIAL spend amounts. */
export const SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS = 6;

const SOCIAL_DECIMALS = 18;

export interface SupportProfileRoutingDisclosure {
  minAmountYocto: bigint;
  treasuryBps: number;
  targetBps: number;
  active: boolean;
}

export function socialToYocto(input: string): string {
  return tokenAmountToSmallestUnit(input, SOCIAL_DECIMALS);
}

export function formatSupportProfileRecipientSharePercent(
  targetBps: number = SUPPORT_PROFILE_TARGET_BPS
): string {
  return `${targetBps / 100}`;
}

export function formatSupportProfileTreasurySharePercent(
  treasuryBps: number = SUPPORT_PROFILE_TREASURY_BPS
): string {
  return `${treasuryBps / 100}`;
}

/**
 * Split a support amount by live bps. Recipient gets floor(amount × targetBps / 10_000);
 * remainder goes to protocol boost so the parts always sum to the input.
 */
export function splitSupportAmountYocto(
  amountYocto: bigint,
  targetBps: number,
  _treasuryBps: number = SUPPORT_PROFILE_TREASURY_BPS
): { recipientYocto: bigint; treasuryYocto: bigint } {
  if (amountYocto <= 0n) {
    return { recipientYocto: 0n, treasuryYocto: 0n };
  }
  const bps = Math.max(0, Math.min(10_000, Math.trunc(targetBps)));
  const recipientYocto = (amountYocto * BigInt(bps)) / 10_000n;
  return {
    recipientYocto,
    treasuryYocto: amountYocto - recipientYocto,
  };
}

/** Compact SOCIAL label for outcome line (same voice as balance). */
export function formatSupportSplitSocialLabel(yocto: bigint): string {
  return formatSocialCompact(yocto);
}

export function formatSpendMinSocialLabel(minYocto: bigint): string {
  return yoctoToSocial(minYocto.toString());
}

export function formatSpendAmountHint(minYocto: bigint): string {
  const label = formatSpendMinSocialLabel(minYocto);
  if (!label || label === '0') {
    return SUPPORT_PROFILE_MIN_SOCIAL_LABEL;
  }
  return label;
}

export function supportPresetsAtOrAboveMin(
  minYocto: bigint,
  presets: readonly string[] = SUPPORT_PROFILE_PRESET_SOCIAL
): string[] {
  return presets.filter((preset) => {
    try {
      return BigInt(socialToYocto(preset)) >= minYocto;
    } catch {
      return false;
    }
  });
}

export function parseSupportAmountYocto(
  input: string,
  minYocto: bigint = SUPPORT_PROFILE_MIN_YOCTO
): bigint {
  const yocto = BigInt(socialToYocto(input.trim()));
  if (yocto < minYocto) {
    throw new Error(
      `Minimum support is ${formatSpendMinSocialLabel(minYocto)} SOCIAL.`
    );
  }
  if (yocto <= 0n) {
    throw new Error('Enter an amount greater than zero.');
  }
  return yocto;
}

export function clampSocialSpendAmountInput(
  input: string,
  opts: {
    maxDecimals?: number;
    balanceYocto?: bigint | null;
  } = {}
): string {
  const maxDecimals = opts.maxDecimals ?? SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS;
  const normalized = input;
  if (!normalized || opts.balanceYocto == null || opts.balanceYocto <= 0n) {
    return normalized;
  }

  const finalized = finalizeAmountInput(normalized, maxDecimals);
  if (!finalized) return normalized;

  try {
    const yocto = BigInt(socialToYocto(finalized));
    if (yocto <= opts.balanceYocto) return normalized;
    return finalizeAmountInput(
      yoctoToSocial(opts.balanceYocto.toString()),
      maxDecimals
    );
  } catch {
    return normalized;
  }
}

function readBps(record: Record<string, unknown>, field: string): number | null {
  const raw = record[field];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return null;
  }
  return raw;
}

/** Minimal parse of social-spend `get_action_config` for support_profile. */
export function parseSupportProfileActionConfig(
  value: unknown
): SupportProfileRoutingDisclosure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const minAmount =
    typeof record.min_amount === 'string'
      ? record.min_amount.trim()
      : typeof record.min_amount === 'number'
        ? String(record.min_amount)
        : '';
  if (!/^\d+$/.test(minAmount)) {
    return null;
  }

  const treasuryBps = readBps(record, 'treasury_bps');
  const targetBps = readBps(record, 'target_bps');
  if (treasuryBps == null || targetBps == null) {
    return null;
  }

  let minAmountYocto = SUPPORT_PROFILE_MIN_YOCTO;
  try {
    minAmountYocto = BigInt(minAmount);
  } catch {
    minAmountYocto = SUPPORT_PROFILE_MIN_YOCTO;
  }

  return {
    minAmountYocto,
    treasuryBps,
    targetBps,
    active: record.active === true,
  };
}

/** Live `support_profile` routing from social-spend; null if unavailable. */
export async function fetchSupportProfileRouting(): Promise<SupportProfileRoutingDisclosure | null> {
  try {
    const config = await viewNearContract<unknown>(
      SOCIAL_SPEND_CONTRACT,
      'get_action_config',
      { action_id: 'support_profile' }
    );
    return parseSupportProfileActionConfig(config);
  } catch {
    return null;
  }
}

/** Unclaimed profile support balance (`get_target_balance`). */
export async function fetchProfileSupportBalanceYocto(
  accountId: string,
  options: { fresh?: boolean } = {}
): Promise<bigint> {
  const search = new URLSearchParams({ accountId });
  if (options.fresh) search.set('fresh', '1');

  const response = await fetch(
    `/api/profile/support-balance?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as {
    balanceYocto?: string;
    error?: string;
    detail?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? `Support balance failed (${response.status})`
    );
  }

  try {
    return BigInt(body?.balanceYocto ?? '0');
  } catch {
    return 0n;
  }
}
