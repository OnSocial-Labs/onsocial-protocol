import { describe, expect, it } from 'vitest';
import {
  contractConfigSplitBpsStringsFromPercents,
  contractConfigSplitPercentsFromBpsStrings,
  contractConfigSplitCounterparty,
  setContractConfigSplitPercent,
} from '@/features/protocol/protocol-contract-config-split';

describe('contractConfigSplitPercentsFromBpsStrings', () => {
  it('maps bps strings to integer percents', () => {
    expect(
      contractConfigSplitPercentsFromBpsStrings('100', '0', '9900', '0')
    ).toEqual({
      treasuryBps: 1,
      seasonPoolBps: 0,
      targetBps: 99,
      burnBps: 0,
    });
  });
});

describe('contractConfigSplitCounterparty', () => {
  it('pairs non-target edits with target and target edits with treasury', () => {
    expect(contractConfigSplitCounterparty('treasuryBps')).toBe('targetBps');
    expect(contractConfigSplitCounterparty('targetBps')).toBe('treasuryBps');
  });
});

describe('setContractConfigSplitPercent', () => {
  it('keeps routing shares at 100% via target', () => {
    const start = contractConfigSplitPercentsFromBpsStrings(
      '100',
      '0',
      '9900',
      '0'
    );
    const next = setContractConfigSplitPercent(start, 'treasuryBps', 5);
    expect(next.treasuryBps + next.seasonPoolBps + next.targetBps + next.burnBps).toBe(
      100
    );
    expect(next).toEqual({
      treasuryBps: 5,
      seasonPoolBps: 0,
      targetBps: 95,
      burnBps: 0,
    });
  });

  it('spills to rally pool when target has no room', () => {
    const start = contractConfigSplitPercentsFromBpsStrings(
      '500',
      '9500',
      '0',
      '0'
    );
    const next = setContractConfigSplitPercent(start, 'treasuryBps', 10);
    expect(next).toEqual({
      treasuryBps: 10,
      seasonPoolBps: 90,
      targetBps: 0,
      burnBps: 0,
    });
  });

  it('balances target edits against treasury', () => {
    const start = contractConfigSplitPercentsFromBpsStrings(
      '100',
      '0',
      '9900',
      '0'
    );
    const next = setContractConfigSplitPercent(start, 'targetBps', 95);
    expect(next).toEqual({
      treasuryBps: 5,
      seasonPoolBps: 0,
      targetBps: 95,
      burnBps: 0,
    });
  });

  it('returns cleared treasury share to target', () => {
    const start = {
      treasuryBps: 5,
      seasonPoolBps: 0,
      targetBps: 95,
      burnBps: 0,
    };
    const next = setContractConfigSplitPercent(start, 'treasuryBps', 0);
    expect(next).toEqual({
      treasuryBps: 0,
      seasonPoolBps: 0,
      targetBps: 100,
      burnBps: 0,
    });
  });

  it('allows one share to take the full cut', () => {
    const start = contractConfigSplitPercentsFromBpsStrings(
      '100',
      '0',
      '9900',
      '0'
    );
    const next = setContractConfigSplitPercent(start, 'treasuryBps', 100);
    expect(next).toEqual({
      treasuryBps: 100,
      seasonPoolBps: 0,
      targetBps: 0,
      burnBps: 0,
    });
  });
});

describe('contractConfigSplitBpsStringsFromPercents', () => {
  it('converts percents back to on-chain bps', () => {
    expect(
      contractConfigSplitBpsStringsFromPercents({
        treasuryBps: 1,
        seasonPoolBps: 0,
        targetBps: 99,
        burnBps: 0,
      })
    ).toEqual({
      treasuryBps: '100',
      seasonPoolBps: '0',
      targetBps: '9900',
      burnBps: '0',
    });
  });
});
