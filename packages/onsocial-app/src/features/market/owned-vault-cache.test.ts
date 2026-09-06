import { describe, expect, it } from 'vitest';
import {
  invalidateOwnedVaultCache,
  peekOwnedVaultFaces,
  peekOwnedVaultPage,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import type { OwnedScarcesPage } from '@/features/market/market-listings';

const page: OwnedScarcesPage = {
  items: [],
  nextFromEnd: 0,
  hasMore: false,
};

describe('owned vault cache faces', () => {
  it('keeps faces on a later page-only write and clears on invalidate', () => {
    invalidateOwnedVaultCache();
    putOwnedVaultPage('Alice.near', page, {
      'bob.near': { avatarUrl: 'https://cdn.example/b.png', displayName: 'Bob' },
    });
    expect(peekOwnedVaultFaces('alice.near').get('bob.near')).toEqual({
      avatarUrl: 'https://cdn.example/b.png',
      displayName: 'Bob',
    });
    putOwnedVaultPage('alice.near', { ...page, hasMore: true });
    expect(peekOwnedVaultPage('alice.near')?.hasMore).toBe(true);
    expect(peekOwnedVaultFaces('alice.near').get('bob.near')?.displayName).toBe(
      'Bob'
    );
    invalidateOwnedVaultCache('alice.near');
    expect(peekOwnedVaultFaces('alice.near').size).toBe(0);
  });
});
