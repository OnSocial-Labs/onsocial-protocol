import { describe, expect, it } from 'vitest';
import {
  normalizeProfileLinks,
  normalizeProfileTags,
  resolveProfileMediaUrl,
} from './profile-display';

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
