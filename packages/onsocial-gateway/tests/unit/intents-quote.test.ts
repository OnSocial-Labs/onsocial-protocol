import { describe, expect, it } from 'vitest';
import {
  WRAP_NEAR_ASSET,
  buildExactNearQuote,
} from '../../src/services/intents/quote.js';

describe('buildExactNearQuote', () => {
  it('asks for an exact amount of wrapped NEAR', () => {
    const quote = buildExactNearQuote({
      originAsset:
        'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      amountOutYocto: '1000000000000000000000000',
      recipient: 'buyer.testnet',
      refundTo: 'buyer.testnet',
      dry: true,
      nowMs: Date.parse('2026-09-29T00:00:00.000Z'),
    });
    expect(quote.body).toMatchObject({
      dry: true,
      swapType: 'EXACT_OUTPUT',
      destinationAsset: WRAP_NEAR_ASSET,
      amount: '1000000000000000000000000',
      recipient: 'buyer.testnet',
      recipientType: 'DESTINATION_CHAIN',
      refundTo: 'buyer.testnet',
      deadline: '2026-09-29T00:03:00.000Z',
    });
    expect(quote.body).not.toHaveProperty('appFees');
  });

  it('rejects an asset that is not on the token list format', () => {
    expect(() =>
      buildExactNearQuote({
        originAsset: 'near',
        amountOutYocto: '1',
        recipient: 'buyer.testnet',
        refundTo: 'buyer.testnet',
      })
    ).toThrow(/nep141/);
  });
});
