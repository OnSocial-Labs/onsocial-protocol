import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';
import {
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  socialToYocto,
} from '@/lib/social-spend-profile';

export type ProtocolStakeMode = 'delegate' | 'undelegate' | 'withdraw';

export function protocolStakeWhisper(
  mode: ProtocolStakeMode,
  isInCooldown = false
): string {
  if (isInCooldown && mode === 'delegate') {
    return 'Delegation paused.';
  }
  if (isInCooldown && mode === 'withdraw') {
    return 'Withdraw locked.';
  }
  switch (mode) {
    case 'delegate':
      return 'Member delegation and vote weight for this board.';
    case 'undelegate':
      return 'Removes vote weight · cooldown starts';
    case 'withdraw':
      return 'Unlocked staked SOCIAL → wallet';
  }
}

export function protocolStakeShowsAmountField(
  mode: ProtocolStakeMode,
  isInCooldown: boolean
): boolean {
  return !protocolStakeActionBlocked(mode, isInCooldown);
}

export function formatProtocolStakeCooldownRemainingMs(
  remainingMs: number
): string | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const totalHours = Math.ceil(remainingMs / 3_600_000);
  const totalDays = Math.ceil(remainingMs / 86_400_000);

  if (totalMinutes < 60) {
    return `${totalMinutes}m left`;
  }
  if (totalHours < 24) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }
  if (totalDays < 7) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
  }
  return `${totalDays}d left`;
}

export function formatProtocolStakeCooldownRemaining(
  cooldownEndsAtNs: string,
  nowMs = Date.now()
): string | null {
  const endsAt = BigInt(cooldownEndsAtNs || '0');
  if (endsAt <= 0n) return null;

  const nowNs = BigInt(nowMs) * 1_000_000n;
  if (endsAt <= nowNs) return null;

  return formatProtocolStakeCooldownRemainingMs(
    Number((endsAt - nowNs) / 1_000_000n)
  );
}

export function formatProtocolStakeCooldownRemainingFromNs(
  cooldownRemainingNs: string
): string | null {
  const remainingNs = BigInt(cooldownRemainingNs || '0');
  if (remainingNs <= 0n) return null;
  return formatProtocolStakeCooldownRemainingMs(
    Number(remainingNs / 1_000_000n)
  );
}

function formatProtocolStakeCooldownMeta(cooldownLeft: string | null): string {
  return cooldownLeft ? `Cooldown · ${cooldownLeft}` : 'Cooldown';
}

export function protocolStakeActionBlocked(
  mode: ProtocolStakeMode,
  isInCooldown: boolean
): boolean {
  return isInCooldown && (mode === 'delegate' || mode === 'withdraw');
}

export function protocolStakeAmountMeta(opts: {
  mode: ProtocolStakeMode;
  maxYocto: bigint;
  isInCooldown: boolean;
  nextActionTimestamp?: string;
  cooldownRemainingNs?: string;
  nowMs?: number;
}): string | null {
  const {
    mode,
    maxYocto,
    isInCooldown,
    nextActionTimestamp = '0',
    cooldownRemainingNs = '0',
    nowMs,
  } = opts;
  const cooldownLeft =
    (isInCooldown
      ? formatProtocolStakeCooldownRemaining(nextActionTimestamp, nowMs)
      : null) ??
    (isInCooldown
      ? formatProtocolStakeCooldownRemainingFromNs(cooldownRemainingNs)
      : null);

  if (mode === 'delegate' && isInCooldown) {
    return formatProtocolStakeCooldownMeta(cooldownLeft);
  }
  if (mode === 'withdraw' && isInCooldown) {
    return formatProtocolStakeCooldownMeta(cooldownLeft);
  }

  if (maxYocto <= 0n) {
    if (mode === 'withdraw') return 'Nothing staked to withdraw';
    if (mode === 'undelegate') return 'Nothing delegated to undelegate';
    return null;
  }

  const amount = formatSocialCompact(maxYocto.toString());
  switch (mode) {
    case 'delegate':
      return `${amount} SOCIAL · wallet + staked`;
    case 'undelegate':
      return `${amount} SOCIAL · delegated`;
    case 'withdraw':
      return `${amount} SOCIAL · staked, not delegated`;
  }
}

export function resolveProtocolStakeMaxYocto(
  eligibility: Pick<
    ProtocolGovernanceEligibility,
    | 'walletBalance'
    | 'availableToDelegate'
    | 'selfDelegatedWeight'
    | 'availableToWithdraw'
  >,
  mode: ProtocolStakeMode
): bigint {
  if (mode === 'delegate') {
    return (
      BigInt(eligibility.walletBalance || '0') +
      BigInt(eligibility.availableToDelegate || '0')
    );
  }
  if (mode === 'undelegate') {
    return BigInt(eligibility.selfDelegatedWeight || '0');
  }
  return BigInt(eligibility.availableToWithdraw || '0');
}

export function finalizeProtocolStakeAmountInput(raw: string): string {
  return finalizeAmountInput(raw, SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS);
}

export function applyProtocolStakeAmountInput(
  raw: string,
  maxYocto: bigint
): string {
  const normalized = normalizeAmountInput(
    raw,
    SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
  );
  if (!normalized || maxYocto <= 0n) return normalized;

  const finalized = finalizeProtocolStakeAmountInput(normalized);
  if (!finalized) return normalized;

  try {
    const yocto = BigInt(socialToYocto(finalized));
    if (yocto <= maxYocto) return normalized;
    return finalizeProtocolStakeAmountInput(yoctoToSocial(maxYocto.toString()));
  } catch {
    return normalized;
  }
}

export function defaultProtocolStakeAmountInput(
  eligibility: ProtocolGovernanceEligibility | null,
  mode: ProtocolStakeMode
): string {
  if (!eligibility) return '';
  if (protocolStakeActionBlocked(mode, eligibility.isInCooldown)) {
    return '';
  }
  if (mode === 'delegate') {
    const need = BigInt(eligibility.remainingToThreshold || '0');
    return need > 0n
      ? finalizeProtocolStakeAmountInput(yoctoToSocial(need.toString()))
      : '';
  }
  if (mode === 'undelegate') {
    const self = BigInt(eligibility.selfDelegatedWeight || '0');
    return self > 0n
      ? finalizeProtocolStakeAmountInput(yoctoToSocial(self.toString()))
      : '';
  }
  const withdraw = BigInt(eligibility.availableToWithdraw || '0');
  return withdraw > 0n
    ? finalizeProtocolStakeAmountInput(yoctoToSocial(withdraw.toString()))
    : '';
}

export function parseProtocolStakeAmountYocto(normalized: string): bigint {
  if (!normalized) return 0n;
  try {
    return BigInt(socialToYocto(normalized));
  } catch {
    return 0n;
  }
}

export function formatProtocolStakeMaxAmount(maxYocto: bigint): string {
  if (maxYocto <= 0n) return '';
  return finalizeProtocolStakeAmountInput(yoctoToSocial(maxYocto.toString()));
}

export function protocolStakeAmountError(
  amountYocto: bigint,
  maxYocto: bigint,
  mode: ProtocolStakeMode
): string | null {
  if (amountYocto <= 0n) return null;
  if (amountYocto <= maxYocto) return null;

  const action =
    mode === 'delegate'
      ? 'delegate'
      : mode === 'undelegate'
        ? 'undelegate'
        : 'withdraw';

  return `Not enough SOCIAL to ${action}.`;
}
