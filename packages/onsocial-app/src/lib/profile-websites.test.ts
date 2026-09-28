import { describe, expect, it } from 'vitest';
import {
  normalizeProfileLinksInput,
  profileLinksInputFromRecord,
} from './profile-links';
import {
  applyPortfolioWebsites,
  portfolioWebsiteDraftError,
  portfolioWebsitesCopyEqual,
  portfolioWebsitesUrlsEqual,
  readPortfolioWebsites,
} from './profile-websites';

describe('applyPortfolioWebsites', () => {
  it('keeps the first site on website and numbers the rest', () => {
    const applied = applyPortfolioWebsites({
      links: {
        github: 'alice',
        website: 'https://old.example/',
        site_2: 'https://gone.example/',
        site_99: 'https://drop.example/',
        custom: 'keep',
      },
      notes: { github: 'Code', website: 'Old', site_2: 'Gone' },
      websites: [
        {
          id: 'a',
          url: 'docs.example.com',
          name: 'Docs',
          line: 'Guides',
        },
        {
          id: 'b',
          url: 'https://blog.example.com/hi',
          name: 'Blog',
          line: '',
        },
      ],
    });

    expect(applied.links.github).toBe('alice');
    expect(applied.links.custom).toBe('keep');
    expect(applied.links.website).toBe('https://docs.example.com/');
    expect(applied.links.site_2).toBe('https://blog.example.com/hi');
    expect(applied.links.site_3).toBeUndefined();
    expect(applied.links.site_99).toBeUndefined();
    expect(applied.notes).toEqual({
      github: 'Code',
      website: 'Docs',
      site_2: 'Blog',
    });
    expect(applied.lines).toEqual({ website: 'Guides' });
  });

  it('drops removed sites and blank rows', () => {
    const applied = applyPortfolioWebsites({
      links: {
        website: 'https://example.com/',
        site_2: 'https://docs.example.com/',
      },
      notes: { website: 'Home' },
      websites: [
        { id: 'blank', url: '', name: '', line: '' },
        { id: 'keep', url: 'docs.example.com', name: 'Docs', line: '' },
      ],
    });
    expect(applied.links.website).toBe('https://docs.example.com/');
    expect(applied.links.site_2).toBeUndefined();
    expect(applied.notes).toEqual({ website: 'Docs' });
  });

  it('leaves extra sites in place when the editor does not own the list', () => {
    const links = normalizeProfileLinksInput(
      profileLinksInputFromRecord({
        website: 'https://example.com/',
        github: 'bob',
      }),
      { site_2: 'https://docs.example.com/', github: 'old' }
    );
    expect(links.website).toBe('https://example.com/');
    expect(links.site_2).toBe('https://docs.example.com/');
    expect(links.github).toBe('bob');
  });
});

describe('readPortfolioWebsites', () => {
  it('round-trips display urls, names, and lines in order', () => {
    const saved = readPortfolioWebsites(
      {
        site_2: 'https://docs.example.com/guide',
        website: 'https://example.com/',
        github: 'alice',
      },
      { website: 'Home', site_2: 'Docs' },
      { site_2: 'Guides' }
    );
    expect(saved).toEqual([
      { id: 'website', url: 'example.com', name: 'Home', line: '' },
      {
        id: 'site_2',
        url: 'docs.example.com/guide',
        name: 'Docs',
        line: 'Guides',
      },
    ]);
    expect(portfolioWebsitesUrlsEqual(saved, saved)).toBe(true);
    expect(
      portfolioWebsitesUrlsEqual(saved, [
        ...saved,
        { id: 'draft', url: '', name: '', line: '' },
      ])
    ).toBe(true);
    expect(
      portfolioWebsitesCopyEqual(saved, [
        { ...saved[0]!, name: 'House' },
        saved[1]!,
      ])
    ).toBe(false);
  });
});

describe('portfolioWebsiteDraftError', () => {
  it('asks for an address only when the row has other text', () => {
    expect(
      portfolioWebsiteDraftError({ id: 'a', url: '', name: '', line: '' })
    ).toBeNull();
    expect(
      portfolioWebsiteDraftError({ id: 'a', url: '', name: 'Docs', line: '' })
    ).toBe('Add an address');
    expect(
      portfolioWebsiteDraftError({
        id: 'a',
        url: 'not a url',
        name: '',
        line: '',
      })
    ).toBe('Invalid URL');
    expect(
      portfolioWebsiteDraftError({
        id: 'a',
        url: 'example.com',
        name: 'Docs',
        line: '',
      })
    ).toBeNull();
  });
});
