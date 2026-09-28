import { describe, expect, it } from 'vitest';
import {
  inferPortfolioLinkKind,
  portfolioLinkDestination,
  portfolioLinkHostname,
  portfolioLinkKindFromHref,
  portfolioLinkPresentation,
  portfolioWebsiteRowCopy,
  resolvePortfolioFaceLinks,
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
      inferPortfolioLinkKind(
        'OnSocial',
        'https://testnet.onsocial.id/@alice.testnet'
      )
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

  it('shows bare OnSocial account ids (not @path fragments)', () => {
    expect(
      portfolioLinkDestination({
        key: 'onsocial',
        kind: 'onsocial',
        label: 'OnSocial',
        href: 'https://testnet.onsocial.id/@alice.testnet',
      })
    ).toBe('alice.testnet');
    expect(
      portfolioLinkDestination({
        key: 'onsocial',
        kind: 'onsocial',
        label: 'OnSocial',
        href: 'https://portal.onsocial.id/u/alice.testnet',
      })
    ).toBe('alice.testnet');
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

describe('portfolioWebsiteRowCopy', () => {
  const site = {
    key: 'website',
    kind: 'website' as const,
    label: 'Website',
    href: 'https://example.com/',
  };

  it('uses the hostname when a site has no name', () => {
    expect(portfolioWebsiteRowCopy(site)).toEqual({
      title: 'example.com',
      detail: null,
    });
  });

  it('keeps a written line and falls back to the hostname', () => {
    expect(
      portfolioWebsiteRowCopy({ ...site, note: 'Docs', line: 'API reference' })
    ).toEqual({ title: 'Docs', detail: 'API reference' });
    expect(portfolioWebsiteRowCopy({ ...site, note: 'Docs' })).toEqual({
      title: 'Docs',
      detail: 'example.com',
    });
  });
});

describe('portfolioLinkKindFromHref', () => {
  it('follows the address and leaves unknown hosts as a globe', () => {
    expect(portfolioLinkKindFromHref('https://github.com/alice')).toBe(
      'github'
    );
    expect(portfolioLinkKindFromHref('https://example.com')).toBe('website');
  });
});

describe('resolvePortfolioFaceLinks', () => {
  it('keeps one plain website as a globe beside direct social icons', () => {
    const face = resolvePortfolioFaceLinks({
      website: 'https://example.com',
      github: 'alice',
    });
    expect(face.mode).toBe('globe');
    expect(face.icons.map((link) => link.key)).toEqual(['website', 'github']);
    expect(face.icons[0]?.kind).toBe('website');
  });

  it('opens the drawer from that globe when one website has something to read', () => {
    const named = resolvePortfolioFaceLinks(
      { website: 'https://example.com', github: 'alice' },
      { website: 'Docs' },
      { website: 'Notes' }
    );
    expect(named.mode).toBe('drawer');
    expect(named.icons.map((link) => link.key)).toEqual(['github']);
    expect(named.websites[0]).toMatchObject({ note: 'Docs', line: 'Notes' });

    const photographed = resolvePortfolioFaceLinks(
      { website: 'https://github.com/alice/repos', x: 'alice' },
      undefined,
      undefined,
      { website: 'https://cdn.example/repos.png' }
    );
    expect(photographed.mode).toBe('drawer');
    expect(photographed.icons.map((link) => link.kind)).toEqual(['x']);
    expect(photographed.websites[0]?.image).toBe(
      'https://cdn.example/repos.png'
    );
  });

  it('folds several websites into one drawer and leaves social icons direct', () => {
    const face = resolvePortfolioFaceLinks(
      {
        website: 'https://example.com',
        site_2: 'https://github.com/alice/repos',
        github: 'alice',
        x: 'alice',
      },
      undefined,
      undefined,
      { site_2: 'https://cdn.example/code.png', website: 'shop' }
    );
    expect(face.mode).toBe('drawer');
    expect(face.icons.map((link) => link.kind)).toEqual(['x', 'github']);
    expect(face.websites.map((link) => link.key)).toEqual([
      'website',
      'site_2',
    ]);
    expect(face.websites[0]?.image).toBeUndefined();
    expect(face.websites[1]?.image).toBe('https://cdn.example/code.png');
  });

  it('does not fold schema v1 link arrays', () => {
    const face = resolvePortfolioFaceLinks([
      { label: 'My blog', url: 'https://blog.example.com' },
      { label: 'Shop', url: 'https://shop.example.com' },
    ]);
    expect(face.mode).toBe('icons');
    expect(face.icons).toHaveLength(2);
    expect(face.websites).toEqual([]);
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
