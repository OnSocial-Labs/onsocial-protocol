import { describe, expect, it } from 'vitest';
import {
  collectionCreatorNameLine,
  commercePartyLines,
  resolveCollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';

describe('collectionCreatorNameLine', () => {
  it('keeps a chosen name', () => {
    expect(collectionCreatorNameLine('alice.near', ' Night ')).toBe('Night');
  });

  it('fills the name slot from the account local part', () => {
    expect(collectionCreatorNameLine('alice.near')).toBe('Alice');
    expect(collectionCreatorNameLine('alice.near', '  ')).toBe('Alice');
    expect(collectionCreatorNameLine('alice.near', 'alice.near')).toBe(
      'Alice'
    );
    expect(
      collectionCreatorNameLine('governance.onsocial.testnet')
    ).toBe('Governance');
    expect(collectionCreatorNameLine('green-ghost.near')).toBe('Green Ghost');
  });
});

describe('commercePartyLines', () => {
  it('always speaks name and id when the profile name is unset', () => {
    expect(commercePartyLines('alice.near')).toEqual({
      name: 'Alice',
      handle: 'alice.near',
    });
  });

  it('keeps a chosen name above the full id', () => {
    expect(commercePartyLines('alice.near', 'Night')).toEqual({
      name: 'Night',
      handle: 'alice.near',
    });
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
