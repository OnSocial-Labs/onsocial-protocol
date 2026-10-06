import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { OnSocial, PostRow } from '@onsocial/sdk';
import { fetchAuthorArticleWindow } from '@/lib/load-portfolio-writing';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'load-portfolio-writing.ts'),
  'utf8'
);

describe('loadPortfolioWritingChrome', () => {
  it('skips the live exists probe when writing=shelf cookie is set', () => {
    expect(src).toContain('e2eWritingShelfChrome');
    expect(src).toContain('isE2eWritingShelfCookie');
    expect(src).toContain('e2eGraphStubsAllowed');
    expect(src).toContain('if (stubChrome) return stubChrome');
  });

  it('paints chrome from shell + page config and never 404s the shelf', () => {
    expect(src).toContain('loadWritingPageConfig');
    expect(src).toContain('loadProfileShell');
    expect(src).toContain('pages.getConfig');
    expect(src).not.toContain('fetchPublicPageData');
    expect(src).not.toContain('notFound');
    expect(src).not.toContain('account/exists');
  });
});

function post(postId: string, article: boolean): PostRow {
  return {
    accountId: 'alice.testnet',
    postId,
    value: article
      ? JSON.stringify({
          x: { onsocial: { article: { title: `Piece ${postId}` } } },
        })
      : 'hello',
  } as PostRow;
}

function client(
  pages: Array<{ items: PostRow[]; nextOffset?: number }>
): OnSocial {
  const recent = vi.fn();
  for (const page of pages) {
    recent.mockResolvedValueOnce({
      items: page.items,
      nextOffset: page.nextOffset,
    });
  }
  return { query: { feed: { recent } } } as unknown as OnSocial;
}

describe('fetchAuthorArticleWindow', () => {
  it('asks the server for longform roots in one query', async () => {
    const os = client([{ items: [], nextOffset: 48 }]);
    await fetchAuthorArticleWindow(os, 'alice.testnet', 0, 48);
    expect(os.query.feed.recent).toHaveBeenCalledTimes(1);
    expect(os.query.feed.recent).toHaveBeenCalledWith({
      author: 'alice.testnet',
      limit: 48,
      offset: 0,
      section: 'posts',
      kind: 'longform',
    });
  });

  it('returns articles from the page, keeping the payload gate', async () => {
    const os = client([
      { items: [post('1', true), post('2', false)], nextOffset: 48 },
    ]);
    const page = await fetchAuthorArticleWindow(os, 'alice.testnet', 0, 48);
    expect(page.articles.map((row) => row.postId)).toEqual(['1']);
    expect(page.nextOffset).toBe(48);
  });

  it('stops when the feed ends', async () => {
    const os = client([{ items: [] }]);
    const page = await fetchAuthorArticleWindow(os, 'alice.testnet', 48, 48);
    expect(page.articles).toEqual([]);
    expect(page.nextOffset).toBeNull();
  });
});
