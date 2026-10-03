import { describe, expect, it } from 'vitest';
import { nearChainPayTokens } from './dollar-purchase';

describe('nearChainPayTokens', () => {
  it('keeps NEAR-chain coins and skips wrapped NEAR', () => {
    const tokens = nearChainPayTokens([
      {
        assetId: 'nep141:wrap.near',
        blockchain: 'near',
        symbol: 'wNEAR',
        decimals: 24,
      },
      {
        assetId:
          'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        blockchain: 'near',
        symbol: 'USDC',
        decimals: 6,
      },
      {
        assetId: 'nep141:eth.omft.near',
        blockchain: 'eth',
        symbol: 'ETH',
        decimals: 18,
      },
    ]);
    expect(tokens).toEqual([
      {
        assetId:
          'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        contractId:
          '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        symbol: 'USDC',
        decimals: 6,
      },
    ]);
  });
});
