import { describe, expect, it } from 'vitest';
import {
  accountDrawerPrimaryLabel,
  displayName,
  fallbackLabel,
  normalizeProfileLinks,
  normalizeProfileTags,
  portfolioHandleForMood,
  portfolioHandleHint,
  resolveProfileMediaUrl,
} from './profile-display';

describe('accountDrawerPrimaryLabel', () => {
  it('uses You when the profile name matches the full account id', () => {
    expect(accountDrawerPrimaryLabel('test03.onsocial', 'test03.onsocial')).toBe(
      'You'
    );
    expect(accountDrawerPrimaryLabel('test03.onsocial')).toBe('You');
    expect(accountDrawerPrimaryLabel('alice.testnet', 'alice.testnet')).toBe(
      'You'
    );
  });

  it('uses a custom profile name when it differs from the account id', () => {
    expect(accountDrawerPrimaryLabel('test03.onsocial', 'Alice')).toBe('Alice');
    expect(accountDrawerPrimaryLabel('alice.testnet', 'alice')).toBe('alice');
  });
});

describe('resolveProfileMediaUrl', () => {
  it('resolves ipfs refs to the OnSocial CDN', () => {
    expect(resolveProfileMediaUrl('ipfs://bafyAvatar')).toBe(
      'https://cdn.testnet.onsocial.id/ipfs/bafyAvatar'
    );
  });

  it('passes through https urls unchanged', () => {
    expect(resolveProfileMediaUrl('https://cdn.example/me.jpg')).toBe(
      'https://cdn.example/me.jpg'
    );
  });

  it('returns null for empty or unsupported values', () => {
    expect(resolveProfileMediaUrl('')).toBeNull();
    expect(resolveProfileMediaUrl('not-a-url')).toBeNull();
    expect(resolveProfileMediaUrl('ipfs://')).toBeNull();
  });
});

describe('normalizeProfileLinks', () => {
  it('reads schema v1 link arrays', () => {
    expect(
      normalizeProfileLinks([
        { label: 'Site', url: 'https://example.com' },
        { label: '  ', url: 'https://skip.test' },
      ])
    ).toEqual([{ label: 'Site', url: 'https://example.com' }]);
  });

  it('reads legacy keyed link maps', () => {
    expect(
      normalizeProfileLinks({
        github: 'https://github.com/alice',
        twitter: '@alice',
      })
    ).toEqual([
      { label: 'Github', url: 'https://github.com/alice' },
      { label: 'Twitter', url: '@alice' },
    ]);
  });

  it('returns an empty list for unsupported shapes', () => {
    expect(normalizeProfileLinks('not-links')).toEqual([]);
    expect(normalizeProfileLinks(null)).toEqual([]);
  });
});

describe('normalizeProfileTags', () => {
  it('trims string tags', () => {
    expect(normalizeProfileTags([' near ', 'builder'])).toEqual([
      'near',
      'builder',
    ]);
  });

  it('returns an empty list when tags are not an array', () => {
    expect(normalizeProfileTags({ near: true })).toEqual([]);
  });
});

describe('portfolioHandleForMood', () => {
  it('formats terminal and signature handles', () => {
    expect(portfolioHandleForMood('alice.testnet', 'terminal')).toBe(
      '~/alice.testnet'
    );
    expect(portfolioHandleForMood('Alice.TESTNET', 'signature')).toBe(
      '@alice.testnet'
    );
  });

  it('shortens implicit handles', () => {
    const implicit =
      'a6e6fa47cfc1ac9d1b2adac3c66015503b9344f87148e3d88d5ec32d7d4eb513';
    expect(portfolioHandleForMood(implicit)).toBe('@a6e6fa47cfc1ac…b513');
  });
});

describe('portfolioHandleHint', () => {
  it('hints when mood handle differs from the editor default', () => {
    expect(portfolioHandleHint('alice.testnet', 'terminal')).toBe(
      'Shows as ~/alice.testnet on your page'
    );
    expect(portfolioHandleHint('alice.testnet', 'protocol')).toBeNull();
  });
});

describe('fallbackLabel', () => {
  it('keeps the full NEAR account id for named accounts', () => {
    expect(fallbackLabel('alice.testnet')).toBe('alice.testnet');
    expect(fallbackLabel('bob.near')).toBe('bob.near');
    expect(fallbackLabel('voter2.onsocial')).toBe('voter2.onsocial');
  });

  it('shortens implicit 64-char hex ids', () => {
    const implicit =
      'a6e6fa47cfc1ac9d1b2adac3c66015503b9344f87148e3d88d5ec32d7d4eb513';
    expect(fallbackLabel(implicit)).toBe('a6e6fa47cfc1ac…b513');
  });
});

describe('displayName', () => {
  it('uses a human title for implicit accounts without a profile name', () => {
    const implicit =
      'a6e6fa47cfc1ac9d1b2adac3c66015503b9344f87148e3d88d5ec32d7d4eb513';
    expect(displayName(implicit)).toBe('Implicit account');
    expect(displayName(implicit, 'Custom')).toBe('Custom');
  });
});
