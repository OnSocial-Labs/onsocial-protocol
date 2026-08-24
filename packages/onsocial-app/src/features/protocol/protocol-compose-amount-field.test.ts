import { describe, expect, it } from 'vitest';
import {
  applyProtocolComposeSocialAmountInput,
  formatProtocolComposeMaxAmount,
  parseProtocolComposeMaxYocto,
} from '@/features/protocol/protocol-compose-amount-field';
import { protocolCreateBoundedSocialAmountReady } from '@/features/protocol/protocol-create-compose';

describe('parseProtocolComposeMaxYocto', () => {
  it('normalizes invalid values to zero', () => {
    expect(parseProtocolComposeMaxYocto(null)).toBe(0n);
    expect(parseProtocolComposeMaxYocto('not-a-number')).toBe(0n);
    expect(parseProtocolComposeMaxYocto('1000000000000000000')).toBe(
      1000000000000000000n
    );
  });
});

describe('formatProtocolComposeMaxAmount', () => {
  it('formats on-chain caps for Max taps', () => {
    expect(formatProtocolComposeMaxAmount('1000000000000000000')).toBe('1');
  });

  it('matches compose input decimals instead of compact rounding', () => {
    expect(formatProtocolComposeMaxAmount('4618866000000000000000')).toBe(
      '4618.866'
    );
  });
});

describe('applyProtocolComposeSocialAmountInput', () => {
  it('clamps SOCIAL typing to the on-chain cap', () => {
    const pool = '4619000000000000000000';
    expect(applyProtocolComposeSocialAmountInput('100', pool)).toBe('100');
    expect(applyProtocolComposeSocialAmountInput('5000', pool)).toBe('4619');
    expect(applyProtocolComposeSocialAmountInput('10000000000000000', pool)).toBe(
      '4619'
    );
  });
});
describe('protocolCreateBoundedSocialAmountReady', () => {
  it('requires a positive amount within the on-chain cap', () => {
    const pool = '2000000000000000000';
    expect(protocolCreateBoundedSocialAmountReady('0', pool)).toBe(false);
    expect(protocolCreateBoundedSocialAmountReady('1', pool)).toBe(true);
    expect(protocolCreateBoundedSocialAmountReady('3', pool)).toBe(false);
  });
});
