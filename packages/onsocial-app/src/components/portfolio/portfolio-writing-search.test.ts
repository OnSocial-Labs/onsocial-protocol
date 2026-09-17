import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = readFileSync(join(here, 'portfolio-writing-chrome.tsx'), 'utf8');
const panel = readFileSync(join(here, 'portfolio-writing-panel.tsx'), 'utf8');
const navSearch = readFileSync(
  join(here, '../../../../onsocial-ui/src/os-app-chrome-nav-search.tsx'),
  'utf8'
);
const searchField = readFileSync(
  join(here, '../../../../onsocial-ui/src/search-field.tsx'),
  'utf8'
);

describe('Writing shelf search', () => {
  it('uses the shared heading search, not a hand-rolled type=search field', () => {
    expect(chrome).toContain('OsAppChromeNavSearch');
    expect(chrome).toContain('PROFILE_SEARCH_MAX_QUERY_LENGTH');
    expect(chrome).toContain('placeholder="Search writing"');
    expect(chrome).not.toContain('type="search"');
    expect(panel).toContain('WritingSearchHeading query={query}');
    expect(panel).not.toContain('type="search"');
    expect(navSearch).toContain('type="text"');
    expect(navSearch).toContain('inputMode="search"');
    expect(searchField).toContain('type="text"');
    expect(searchField).toContain('inputMode="search"');
  });

  it('keeps typing live and defers the article-card filter', () => {
    expect(panel).toContain('useDeferredValue');
    expect(panel).toContain('resolveWritingListQuery');
    expect(panel).toContain('query={listQuery}');
    expect(panel).toContain('memo(function PortfolioWritingList');
  });
});
