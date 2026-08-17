import { describe, expect, it } from 'vitest';
import { formatSwapInputBalance } from '@/lib/app-swap-format';
import {
  appSwapHintMessage,
  evaluateAppSwapValidation,
} from '@/lib/app-swap-validation';

describe('formatSwapInputBalance', () => {
  it('formats NEAR yocto to a short decimal', () => {
    expect(
      formatSwapInputBalance('1500000000000000000000000', 24, 'NEAR')
    ).toBe('1.5');
  });

  it('formats USDC atomic units', () => {
    expect(formatSwapInputBalance('2500000', 6, 'USDC')).toBe('2.5');
  });
});

describe('evaluateAppSwapValidation', () => {
  it('blocks when NEAR amount leaves no gas reserve', () => {
    const result = evaluateAppSwapValidation({
      tokenIn: 'near',
      amountIn: '1',
      inputBalanceYocto: '1000000000000000000000000',
      nearBalanceYocto: '1000000000000000000000000',
      needsWnearStorage: false,
      hasQuote: true,
      estimating: false,
      refreshingQuote: false,
      swapping: false,
      accountId: 'alice.near',
      enabled: true,
    });
    expect(result.canSwap).toBe(false);
    expect(result.hint).toBe('gas-near-input');
    expect(appSwapHintMessage('gas-near-input')).toMatch(/NEAR/);
  });

  it('allows a valid NEAR quote with headroom', () => {
    const result = evaluateAppSwapValidation({
      tokenIn: 'near',
      amountIn: '0.1',
      inputBalanceYocto: '2000000000000000000000000',
      nearBalanceYocto: '2000000000000000000000000',
      needsWnearStorage: false,
      hasQuote: true,
      estimating: false,
      refreshingQuote: false,
      swapping: false,
      accountId: 'alice.near',
      enabled: true,
    });
    expect(result.canSwap).toBe(true);
    expect(result.hint).toBeNull();
  });
});
