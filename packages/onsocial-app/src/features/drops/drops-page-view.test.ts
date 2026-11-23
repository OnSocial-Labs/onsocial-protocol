import { describe, expect, it } from 'vitest';
import {
  dropsShopActionLabel,
  dropsShopMintable,
} from '@/features/drops/drops-page-view';

describe('drops shop action', () => {
  it('is Collect on live and allowlist early mint, Open otherwise', () => {
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'live',
          hasAllowlist: false,
        })
      )
    ).toBe('Collect');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'upcoming',
          hasAllowlist: true,
          allowlistRemaining: 2,
        })
      )
    ).toBe('Collect');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'upcoming',
          hasAllowlist: true,
          allowlistRemaining: 0,
        })
      )
    ).toBe('Open');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'ended',
          hasAllowlist: false,
        })
      )
    ).toBe('Open');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'sold_out',
          hasAllowlist: false,
        })
      )
    ).toBe('Open');
  });
});
