import { describe, expect, it } from 'vitest';
import {
  applyProtocolStakeAmountInput,
  defaultProtocolStakeAmountInput,
  finalizeProtocolStakeAmountInput,
  formatProtocolStakeCooldownRemaining,
  formatProtocolStakeCooldownRemainingFromNs,
  parseProtocolStakeAmountYocto,
  protocolStakeActionBlocked,
  protocolStakeAmountError,
  protocolStakeAmountMeta,
  protocolStakeWhisper,
  resolveProtocolStakeMaxYocto,
} from '@/features/protocol/protocol-stake-amount';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';

const baseEligibility = {
  walletBalance: '1000000000000000000000',
  availableToDelegate: '100000000000000000000',
  selfDelegatedWeight: '50000000000000000000',
  availableToWithdraw: '25000000000000000000',
  remainingToThreshold: '400000000000000000000',
} as Pick<
  ProtocolGovernanceEligibility,
  | 'walletBalance'
  | 'availableToDelegate'
  | 'selfDelegatedWeight'
  | 'availableToWithdraw'
  | 'remainingToThreshold'
>;

describe('protocol-stake-amount', () => {
  it('finalizes fractional typing input', () => {
    expect(finalizeProtocolStakeAmountInput('400.500000')).toBe('400.5');
    expect(finalizeProtocolStakeAmountInput('00.10')).toBe('0.1');
  });

  it('clamps delegate input to wallet plus staked', () => {
    const max = resolveProtocolStakeMaxYocto(baseEligibility, 'delegate');
    expect(max).toBe(1100n * 10n ** 18n);
    expect(applyProtocolStakeAmountInput('2000', max)).toBe('1100');
    expect(applyProtocolStakeAmountInput('400abc', max)).toBe('400');
  });

  it('defaults delegate amount to remaining threshold', () => {
    expect(
      defaultProtocolStakeAmountInput(
        baseEligibility as ProtocolGovernanceEligibility,
        'delegate'
      )
    ).toBe('400');
  });

  it('parses normalized amounts to yocto', () => {
    expect(parseProtocolStakeAmountYocto('400')).toBe(400n * 10n ** 18n);
    expect(parseProtocolStakeAmountYocto('')).toBe(0n);
  });

  it('reports over-max errors by mode', () => {
    const max = resolveProtocolStakeMaxYocto(baseEligibility, 'undelegate');
    expect(protocolStakeAmountError(max + 1n, max, 'undelegate')).toMatch(
      /undelegate/i
    );
    expect(protocolStakeAmountError(max, max, 'undelegate')).toBeNull();
  });

  it('morphs whisper and meta by stake mode', () => {
    expect(protocolStakeWhisper('withdraw')).toMatch(/wallet/i);
    expect(protocolStakeWhisper('delegate', true)).toMatch(/paused/i);
    expect(
      protocolStakeAmountMeta({
        mode: 'withdraw',
        maxYocto: 100n * 10n ** 18n,
        isInCooldown: false,
      })
    ).toMatch(/staked, not delegated/i);
    expect(
      protocolStakeAmountMeta({
        mode: 'withdraw',
        maxYocto: 0n,
        isInCooldown: true,
        nextActionTimestamp: String(
          BigInt(Date.now() + 2 * 60 * 60 * 1000) * 1_000_000n
        ),
        cooldownRemainingNs: String(2n * 60n * 60n * 1_000_000_000n),
        nowMs: Date.now(),
      })
    ).toMatch(/Cooldown · 2h left/i);
  });

  it('clears default amount during cooldown on delegate and withdraw', () => {
    const inCooldown = {
      ...baseEligibility,
      isInCooldown: true,
    } as ProtocolGovernanceEligibility;
    expect(defaultProtocolStakeAmountInput(inCooldown, 'delegate')).toBe('');
    expect(defaultProtocolStakeAmountInput(inCooldown, 'withdraw')).toBe('');
    expect(defaultProtocolStakeAmountInput(inCooldown, 'undelegate')).toBe(
      '50'
    );
  });

  it('formats cooldown remaining from next action timestamp', () => {
    const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    const endsAt = String(
      BigInt(nowMs + 90 * 60 * 1000) * 1_000_000n
    );
    expect(formatProtocolStakeCooldownRemaining(endsAt, nowMs)).toBe(
      '1h 30m left'
    );
  });

  it('formats cooldown remaining from remaining ns', () => {
    expect(
      formatProtocolStakeCooldownRemainingFromNs(String(2n * 60n * 60n * 1_000_000_000n))
    ).toBe('2h left');
  });

  it('blocks delegate and withdraw during cooldown', () => {
    expect(protocolStakeActionBlocked('delegate', true)).toBe(true);
    expect(protocolStakeActionBlocked('withdraw', true)).toBe(true);
    expect(protocolStakeActionBlocked('undelegate', true)).toBe(false);
  });
});
