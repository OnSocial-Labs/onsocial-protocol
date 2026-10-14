import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { profileLinksInputFromRecord } from '@/lib/profile-links';

describe('PortfolioLinks', () => {
  it('opens a single plain website from the globe', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioLinks, {
        links: { website: 'https://example.com', github: 'alice' },
      })
    );
    expect(html).toContain('data-portfolio-link-mode="globe"');
    expect(html).toContain('aria-label="Website"');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).toContain('M12 21.5a9.5');
    expect(html).not.toContain('aria-label="Links"');
    expect(html).not.toContain('M10.522 13.48');
  });

  it('opens the drawer from the globe when a website has a name', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioLinks, {
        links: { website: 'https://example.com', github: 'alice' },
        notes: { website: 'Docs' },
        images: { website: 'https://cdn.example/docs.png' },
      })
    );
    expect(html).toContain('data-portfolio-link-mode="drawer"');
    expect(html).toContain('aria-label="Links"');
    expect(html).toContain('data-link-kind="website"');
    expect(html).toContain('M12 21.5a9.5');
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).not.toContain('href="https://example.com/"');
    expect(html).not.toContain('https://cdn.example/docs.png');
    expect(html).not.toContain('M10.522 13.48');
  });

  it('opens the drawer from the globe when there are several websites', () => {
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
    expect(html).toContain('data-link-kind="website"');
    expect(html).toContain('M12 21.5a9.5');
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).not.toContain('href="https://example.com/"');
    expect(html).not.toContain('href="https://docs.example.com/"');
    expect(html).not.toContain('M10.522 13.48');
  });
});

describe('ProfileLinksEditor websites', () => {
  const noop = () => undefined;

  it('keeps website behind Add link for DAO editors', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileLinksEditor, {
        links: profileLinksInputFromRecord(null),
        fieldErrors: {},
        onUpdateLink: noop,
        onClearFieldError: noop,
        onSetFieldError: noop,
      })
    );
    expect(html).toContain('Add link');
    expect(html).not.toContain('>Website<');
    expect(html).not.toContain('placeholder="example.com"');
  });

  it('shows a website as the globe beside social icons', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileLinksEditor, {
        links: profileLinksInputFromRecord({ github: 'alice' }),
        fieldErrors: {},
        omitWebsite: true,
        websites: [
          {
            id: 'website',
            url: 'example.com',
            name: 'Docs',
            line: 'Guides',
          },
        ],
        onSaveWebsite: noop,
        onRemoveWebsite: noop,
        canAddWebsite: true,
        onUpdateLink: noop,
        onClearFieldError: noop,
        onSetFieldError: noop,
      })
    );
    expect(html).toContain('aria-label="Edit website"');
    expect(html).toContain('Edit GitHub');
    expect(html).not.toContain('Docs');
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('Guides');
    expect(html).not.toContain('>Website<');
  });

  it('keeps a website photo off the icon row', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileLinksEditor, {
        links: profileLinksInputFromRecord(null),
        fieldErrors: {},
        omitWebsite: true,
        websites: [
          {
            id: 'website',
            url: 'example.com',
            name: 'Docs',
            line: '',
            image: 'https://cdn.example/docs.png',
          },
        ],
        onSaveWebsite: noop,
        onRemoveWebsite: noop,
        onUpdateLink: noop,
        onClearFieldError: noop,
        onSetFieldError: noop,
      })
    );
    expect(html).toContain('aria-label="Edit website"');
    expect(html).not.toContain('https://cdn.example/docs.png');
    expect(html).not.toContain('Remove photo');
  });
});
