import { describe, expect, it } from 'vitest';
import {
  collectionCreatorNameLine,
  resolveCollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';

describe('collectionCreatorNameLine', () => {
  it('keeps a chosen name', () => {
    expect(collectionCreatorNameLine('alice.near', ' Night ')).toBe('Night');
  });

  it('fills the name slot from the account local part', () => {
    expect(collectionCreatorNameLine('alice.near')).toBe('Alice');
    expect(collectionCreatorNameLine('alice.near', '  ')).toBe('Alice');
    expect(
      collectionCreatorNameLine('governance.onsocial.testnet')
    ).toBe('Governance');
    expect(collectionCreatorNameLine('green-ghost.near')).toBe('Green Ghost');
  });
});

describe('resolveCollectionCreatorFace', () => {
  it('does not treat the local-part title as a stored display name', () => {
    expect(
      resolveCollectionCreatorFace('alice.near', {
        profileName: 'alice.near',
      }).displayName
    ).toBeNull();
    expect(
      resolveCollectionCreatorFace('alice.near', {
        profileName: 'Night',
      }).displayName
    ).toBe('Night');
  });
});
