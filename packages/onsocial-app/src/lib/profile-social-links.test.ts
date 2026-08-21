import { describe, expect, it } from 'vitest';
import {
  inferPortfolioLinkKind,
  portfolioLinkDestination,
  portfolioLinkHostname,
  portfolioLinkPresentation,
  resolvePortfolioSocialLinks,
} from './profile-social-links';

describe('resolvePortfolioSocialLinks', () => {
  it('resolves keyed chain maps in portal display order', () => {
    expect(
      resolvePortfolioSocialLinks({
        github: 'alice',
        twitter: 'alice',
        website: 'https://example.com',
        onsocial: 'alice.testnet',
      })
    ).toEqual([
      {
        key: 'website',
        kind: 'website',
        label: 'Website',
        href: 'https://example.com/',
      },
      {
        key: 'onsocial',
        kind: 'onsocial',
        label: 'OnSocial',
        href: 'https://testnet.onsocial.id/@alice.testnet',
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
      inferPortfolioLinkKind('OnSocial', 'https://testnet.onsocial.id/@alice.testnet')
    ).toBe('onsocial');
    expect(
      inferPortfolioLinkKind('Newsletter', 'https://substack.com/@alice')
    ).toBe('custom');
  });
});

describe('portfolioLinkHostname', () => {
  it('strips www for showcase rows', () => {
    expect(portfolioLinkHostname('https://www.example.com/path')).toBe(
      'example.com'
    );
  });
});

describe('portfolioLinkDestination', () => {
  it('shows website hostname and native social handles', () => {
    expect(
      portfolioLinkDestination({
        key: 'website',
        kind: 'website',
        label: 'Website',
        href: 'https://www.onsocial.id',
      })
    ).toBe('onsocial.id');
    expect(
      portfolioLinkDestination({
        key: 'x',
        kind: 'x',
        label: 'X',
        href: 'https://x.com/alice',
      })
    ).toBe('@alice');
  });

  it('uses LinkedIn and GitHub slugs instead of fake @folder handles', () => {
    expect(
      portfolioLinkDestination({
        key: 'linkedin',
        kind: 'linkedin',
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/company/onsocial',
      })
    ).toBe('onsocial');
    expect(
      portfolioLinkDestination({
        key: 'linkedin',
        kind: 'linkedin',
        label: 'LinkedIn',
        href: 'https://linkedin.com/in/jane-doe',
      })
    ).toBe('jane-doe');
    expect(
      portfolioLinkDestination({
        key: 'github',
        kind: 'github',
        label: 'GitHub',
        href: 'https://github.com/greenghostnear',
      })
    ).toBe('greenghostnear');
  });
});

describe('portfolioLinkPresentation', () => {
  it('uses the owner note as title and keeps the destination underneath', () => {
    expect(
      portfolioLinkPresentation({
        key: 'website',
        kind: 'website',
        label: 'Website',
        href: 'https://example.com',
        note: 'My Website',
      })
    ).toEqual({
      title: 'My Website',
      detail: 'example.com',
    });
  });

  it('hides a destination that duplicates the title', () => {
    expect(
      portfolioLinkPresentation({
        key: 'github',
        kind: 'github',
        label: 'GitHub',
        href: 'https://github.com/greenghostnear',
        note: 'greenghostnear',
      })
    ).toEqual({
      title: 'greenghostnear',
      detail: null,
    });
  });
});
