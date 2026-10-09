import { describe, expect, it } from 'vitest';
import {
  SCARCE_BUY_GAS_RESERVE_YOCTO,
  scarceBuyAfford,
} from './scarce-buy-afford';

const ONE_NEAR = 10n ** 24n;
const SHORT = 42n * 10n ** 22n;

const nearPay = {
  payWithToken: false,
  tokenAmountIn: null,
  tokenBalance: null,
  tokenSymbol: null,
  tokenDecimals: 24,
  otherPayLabel: null,
};

describe('scarceBuyAfford', () => {
  it('leaves Buy open when the wallet covers the NEAR and fees', () => {
    expect(
      scarceBuyAfford({
        ...nearPay,
        depositYocto: ONE_NEAR,
        nearBalanceYocto: ONE_NEAR + SCARCE_BUY_GAS_RESERVE_YOCTO,
      })
    ).toEqual({ blocked: false, hint: null });
  });

  it('names the NEAR shortfall and keeps the check quiet until the balance is known', () => {
    const short = scarceBuyAfford({
      ...nearPay,
      depositYocto: ONE_NEAR,
      nearBalanceYocto: ONE_NEAR + SCARCE_BUY_GAS_RESERVE_YOCTO - SHORT,
    });
    expect(short).toEqual({
      blocked: true,
      hint: 'Need 0.42 NEAR more.',
    });

    expect(
      scarceBuyAfford({
        ...nearPay,
        depositYocto: ONE_NEAR,
        nearBalanceYocto: null,
      }).blocked
    ).toBe(false);
    expect(
      scarceBuyAfford({
        ...nearPay,
        depositYocto: null,
        nearBalanceYocto: 0n,
      }).blocked
    ).toBe(false);
  });

  it('offers another coin only when that path can still pay the fees', () => {
    const withFees = scarceBuyAfford({
      ...nearPay,
      depositYocto: ONE_NEAR,
      nearBalanceYocto: ONE_NEAR + SCARCE_BUY_GAS_RESERVE_YOCTO - SHORT,
      otherPayLabel: 'USDC',
    });
    expect(withFees.hint).toBe('Need 0.42 NEAR more. Or pay with USDC.');

    const noFees = scarceBuyAfford({
      ...nearPay,
      depositYocto: ONE_NEAR,
      nearBalanceYocto: 0n,
      otherPayLabel: 'USDC',
    });
    expect(noFees.hint).toBe('Need 1.03 NEAR more.');
  });

  it('asks for the other coin, and only a little NEAR when that coin covers the buy', () => {
    expect(
      scarceBuyAfford({
        ...nearPay,
        payWithToken: true,
        depositYocto: ONE_NEAR,
        nearBalanceYocto: ONE_NEAR,
        tokenAmountIn: 5_000_000n,
        tokenBalance: 2_900_000n,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      })
    ).toEqual({ blocked: true, hint: 'Need 2.1 USDC more.' });

    expect(
      scarceBuyAfford({
        ...nearPay,
        payWithToken: true,
        depositYocto: ONE_NEAR,
        nearBalanceYocto: SCARCE_BUY_GAS_RESERVE_YOCTO - 1n,
        tokenAmountIn: 5_000_000n,
        tokenBalance: 5_000_000n,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      })
    ).toEqual({ blocked: true, hint: 'Keep a little NEAR for fees.' });

    expect(
      scarceBuyAfford({
        ...nearPay,
        payWithToken: true,
        depositYocto: ONE_NEAR,
        nearBalanceYocto: SCARCE_BUY_GAS_RESERVE_YOCTO,
        tokenAmountIn: null,
        tokenBalance: 0n,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      }).blocked
    ).toBe(false);
  });

  it('asks a free mint to keep fee NEAR only', () => {
    expect(
      scarceBuyAfford({
        ...nearPay,
        depositYocto: 0n,
        nearBalanceYocto: 0n,
      })
    ).toEqual({ blocked: true, hint: 'Keep a little NEAR for fees.' });
  });
});
