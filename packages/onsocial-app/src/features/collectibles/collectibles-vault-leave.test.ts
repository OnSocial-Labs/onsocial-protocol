import { describe, expect, it } from 'vitest';
import {
  portfolioCollectionDrawerPath,
  portfolioVaultBackPops,
} from '@/features/collectibles/collectibles-vault-leave';

describe('portfolio vault leave', () => {
  it('returns to that face’s Collectibles drawer', () => {
    expect(portfolioCollectionDrawerPath('Ada.near')).toBe(
      '/@Ada.near?tab=collection'
    );
  });

  it('pops when the vault was opened from the same face', () => {
    expect(
      portfolioVaultBackPops('ada.near', '/@ada.near?tab=collection')
    ).toBe(true);
    expect(
      portfolioVaultBackPops('ada.near', '/@ada.near/collectibles')
    ).toBe(true);
  });

  it('does not pop across faces or on a cold open', () => {
    expect(
      portfolioVaultBackPops('you.near', '/@them.near?tab=collection')
    ).toBe(false);
    expect(portfolioVaultBackPops('you.near', '/home')).toBe(false);
    expect(portfolioVaultBackPops('you.near', null)).toBe(false);
    expect(portfolioVaultBackPops(null, '/@you.near')).toBe(false);
  });
});
