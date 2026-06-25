import { describe, expect, it } from 'vitest';
import {
  inferPortfolioLinkKind,
  resolvePortfolioSocialLinks,
} from './profile-social-links';

describe('resolvePortfolioSocialLinks', () => {
  it('resolves keyed chain maps in portal display order', () => {
    expect(
      resolvePortfolioSocialLinks({
        github: 'alice',
        twitter: 'alice',
        website: 'https://example.com',
      })
    ).toEqual([
      {
        key: 'website',
        kind: 'website',
        label: 'Website',
        href: 'https://example.com/',
      },
      {
        key: 'x',
        kind: 'x',
        label: 'X',
        href: 'https://x.com/alice',
      },
      {
        key: 'github',
        kind: 'github',
        label: 'GitHub',
        href: 'https://github.com/alice',
      },
    ]);
  });

  it('infers kinds for schema v1 link arrays', () => {
    expect(
      resolvePortfolioSocialLinks([
        { label: 'GitHub', url: 'https://github.com/alice' },
        { label: 'My blog', url: 'https://blog.example.com' },
      ])
    ).toEqual([
      {
        key: 'github:https://github.com/alice',
        kind: 'github',
        label: 'GitHub',
        href: 'https://github.com/alice',
      },
      {
        key: 'custom:https://blog.example.com/',
        kind: 'custom',
        label: 'My blog',
        href: 'https://blog.example.com/',
      },
    ]);
  });
});

describe('inferPortfolioLinkKind', () => {
  it('maps labels and hostnames', () => {
    expect(inferPortfolioLinkKind('Telegram', 'https://t.me/alice')).toBe(
      'telegram'
    );
    expect(
      inferPortfolioLinkKind('Newsletter', 'https://substack.com/@alice')
    ).toBe('custom');
  });
});
