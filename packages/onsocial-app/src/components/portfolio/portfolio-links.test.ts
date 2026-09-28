import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioWebsitesEditor } from '@/components/wallet/portfolio-websites-editor';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { profileLinksInputFromRecord } from '@/lib/profile-links';

describe('PortfolioLinks', () => {
  it('opens a single website from the globe', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioLinks, {
        links: { website: 'https://example.com', github: 'alice' },
        notes: { website: 'Docs' },
      })
    );
    expect(html).toContain('data-portfolio-link-mode="globe"');
    expect(html).toContain('aria-label="Docs"');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).not.toContain('aria-label="Links"');
  });

  it('uses one link icon when there are several websites', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioLinks, {
        links: {
          website: 'https://example.com',
          site_2: 'https://docs.example.com',
          github: 'alice',
        },
      })
    );
    expect(html).toContain('data-portfolio-link-mode="drawer"');
    expect(html).toContain('aria-label="Links"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).not.toContain('href="https://example.com/"');
    expect(html).not.toContain('href="https://docs.example.com/"');
  });
});

describe('ProfileLinksEditor websites', () => {
  const noop = () => undefined;

  it('keeps a single website field for DAO editors', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileLinksEditor, {
        links: profileLinksInputFromRecord(null),
        fieldErrors: {},
        onUpdateLink: noop,
        onClearFieldError: noop,
        onSetFieldError: noop,
      })
    );
    expect(html).toContain('>Website<');
  });

  it('hides that field when websites have their own list', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileLinksEditor, {
        links: profileLinksInputFromRecord({
          website: 'https://example.com',
          github: 'alice',
        }),
        fieldErrors: {},
        omitWebsite: true,
        websitesSlot: createElement('p', null, 'Add website'),
        onUpdateLink: noop,
        onClearFieldError: noop,
        onSetFieldError: noop,
      })
    );
    expect(html).toContain('Add website');
    expect(html).toContain('Edit GitHub');
    expect(html).not.toContain('Edit Website');
    expect(html).not.toContain('>Website<');
  });
});

describe('PortfolioWebsitesEditor', () => {
  it('lists name, address, and an optional line', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioWebsitesEditor, {
        websites: [
          {
            id: 'website',
            url: 'example.com',
            name: 'Docs',
            line: 'Guides',
          },
        ],
        errors: {},
        onChange: () => undefined,
        onRemove: () => undefined,
        onAdd: () => undefined,
        onBlurRow: () => undefined,
      })
    );
    expect(html).toContain('value="Docs"');
    expect(html).toContain('value="example.com"');
    expect(html).toContain('value="Guides"');
    expect(html).toContain('Add website');
    expect(html).toContain('aria-label="Website name"');
    expect(html).toContain('aria-label="Website address"');
    expect(html).toContain('aria-label="Website line"');
  });
});
