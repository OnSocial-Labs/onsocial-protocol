import { describe, expect, it } from 'vitest';
import {
  formatTreasuryAssetCompact,
  isNearTreasuryAsset,
  isSocialTreasuryAsset,
  partitionTreasuryAssets,
} from '@/features/protocol/dao-treasury-format';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';

const nearAsset: ProtocolDaoTransferAsset = {
  tokenId: '',
  symbol: 'NEAR',
  name: 'NEAR',
  icon: null,
  decimals: 24,
  balanceSmallest: '1502291000000000000000000',
};

const socialAsset: ProtocolDaoTransferAsset = {
  tokenId: 'social.testnet',
  symbol: 'SOCIAL',
  name: 'OnSocial',
  icon: null,
  decimals: 18,
  balanceSmallest: '223992860931861000000000000',
};

describe('dao-treasury-format', () => {
  it('classifies NEAR and SOCIAL assets', () => {
    expect(isNearTreasuryAsset(nearAsset)).toBe(true);
    expect(isSocialTreasuryAsset(socialAsset)).toBe(true);
    expect(isSocialTreasuryAsset(nearAsset)).toBe(false);
  });

  it('formats treasury amounts compactly', () => {
    expect(formatTreasuryAssetCompact(nearAsset)).toBe('1.5023');
    expect(formatTreasuryAssetCompact(socialAsset)).toBe('224.0M');
  });

  it('partitions wallet assets', () => {
    expect(
      partitionTreasuryAssets([
        socialAsset,
        nearAsset,
        {
          tokenId: 'usdc.testnet',
          symbol: 'USDC',
          name: 'USD Coin',
          icon: null,
          decimals: 6,
          balanceSmallest: '2500000',
        },
      ])
    ).toEqual({
      near: nearAsset,
      social: socialAsset,
      other: [
        {
          tokenId: 'usdc.testnet',
          symbol: 'USDC',
          name: 'USD Coin',
          icon: null,
          decimals: 6,
          balanceSmallest: '2500000',
        },
      ],
    });
  });
});
