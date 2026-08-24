import { describe, expect, it } from 'vitest';
import {
  formatProtocolTransferAssetAmount,
  protocolCreateTransferAmountReady,
  protocolCreateTransferReady,
  protocolTransferAssetOptionValue,
  protocolTransferTokenIdFromOptionValue,
  resolveProtocolTransferAmountYocto,
  resolveProtocolTransferAsset,
} from '@/features/protocol/protocol-transfer-compose';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';

const NEAR_ASSET: ProtocolDaoTransferAsset = {
  tokenId: '',
  symbol: 'NEAR',
  name: 'NEAR',
  icon: '/near.svg',
  decimals: 24,
  balanceSmallest: '3796022000000000000000000',
};

const SOCIAL_ASSET: ProtocolDaoTransferAsset = {
  tokenId: 'social.testnet',
  symbol: 'SOCIAL',
  name: 'SOCIAL',
  icon: '/onsocial_icon.svg',
  decimals: 18,
  balanceSmallest: '2000000000000000000',
};

describe('formatProtocolTransferAssetAmount', () => {
  it('formats yocto NEAR balances for display', () => {
    expect(
      formatProtocolTransferAssetAmount(NEAR_ASSET.balanceSmallest, 24)
    ).toBe('3.796022');
  });
});

describe('protocolTransferAssetOptionValue', () => {
  it('maps native NEAR to a non-empty drawer value', () => {
    expect(protocolTransferAssetOptionValue('')).toBe('__native_near__');
    expect(protocolTransferTokenIdFromOptionValue('__native_near__')).toBe('');
    expect(protocolTransferAssetOptionValue('social.testnet')).toBe(
      'social.testnet'
    );
  });
});

describe('resolveProtocolTransferAsset', () => {
  it('prefers the selected token and falls back to the first asset', () => {
    expect(
      resolveProtocolTransferAsset([NEAR_ASSET, SOCIAL_ASSET], 'social.testnet')
    ).toEqual(SOCIAL_ASSET);
    expect(
      resolveProtocolTransferAsset([NEAR_ASSET, SOCIAL_ASSET], 'missing')
    ).toEqual(NEAR_ASSET);
    expect(resolveProtocolTransferAsset([], 'near')).toBeNull();
  });
});

describe('protocolCreateTransferAmountReady', () => {
  it('requires a positive amount within the DAO asset balance', () => {
    expect(
      protocolCreateTransferAmountReady('0', {
        decimals: NEAR_ASSET.decimals,
        balanceSmallest: NEAR_ASSET.balanceSmallest,
      })
    ).toBe(false);
    expect(
      protocolCreateTransferAmountReady('1', {
        decimals: NEAR_ASSET.decimals,
        balanceSmallest: NEAR_ASSET.balanceSmallest,
      })
    ).toBe(true);
    expect(
      protocolCreateTransferAmountReady('4', {
        decimals: NEAR_ASSET.decimals,
        balanceSmallest: NEAR_ASSET.balanceSmallest,
      })
    ).toBe(false);
  });
});

describe('protocolCreateTransferReady', () => {
  it('requires asset, valid recipient format, and bounded amount', () => {
    expect(
      protocolCreateTransferReady(NEAR_ASSET, 'found', 'alice.testnet', '1')
    ).toBe(true);
    expect(
      protocolCreateTransferReady(null, 'found', 'alice.testnet', '1')
    ).toBe(false);
    expect(
      protocolCreateTransferReady(NEAR_ASSET, 'idle', 'alice.testnet', '1')
    ).toBe(false);
    expect(
      protocolCreateTransferReady(NEAR_ASSET, 'invalid', 'alice', '1')
    ).toBe(false);
    expect(
      protocolCreateTransferReady(NEAR_ASSET, 'found', 'alice.testnet', '0')
    ).toBe(false);
  });
});

describe('resolveProtocolTransferAmountYocto', () => {
  it('returns smallest units for valid amounts', () => {
    expect(resolveProtocolTransferAmountYocto('1', NEAR_ASSET)).toBe(
      '1000000000000000000000000'
    );
  });

  it('throws with actionable errors for invalid amounts', () => {
    expect(() => resolveProtocolTransferAmountYocto('', NEAR_ASSET)).toThrow(
      /valid transfer amount/i
    );
    expect(() => resolveProtocolTransferAmountYocto('4', NEAR_ASSET)).toThrow(
      /exceeds the DAO NEAR balance/i
    );
  });
});
