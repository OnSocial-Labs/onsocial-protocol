import { describe, expect, it } from 'vitest';
import {
  ARTICLE_TITLE_MAX,
  articleCoverUrl,
  articleExcerpt,
  articleMatchesQuery,
  articleSnapshotExtra,
  articleTeaseSource,
  isArticlePost,
  normalizeArticleTitle,
  parseArticleSnapshot,
  resolveComposerArticle,
  resolvePostCardOpenHref,
  resolveWritingEmptyState,
  shouldShowWritingLink,
} from './article-post-payload';

function postValue(
  extra: Record<string, unknown>,
  text = 'Body of the piece.'
) {
  return JSON.stringify({
    v: 1,
    text,
    ...extra,
  });
}

describe('normalizeArticleTitle', () => {
  it('trims and collapses space', () => {
    expect(normalizeArticleTitle('  Night  drive  ')).toBe('Night drive');
  });

  it('rejects empty', () => {
    expect(normalizeArticleTitle('   ')).toBeNull();
    expect(normalizeArticleTitle(null)).toBeNull();
  });

  it('caps length', () => {
    const title = normalizeArticleTitle('x'.repeat(ARTICLE_TITLE_MAX + 8));
    expect(title).toHaveLength(ARTICLE_TITLE_MAX);
  });
});

describe('articleSnapshotExtra', () => {
  it('writes title and omits default left align', () => {
    expect(articleSnapshotExtra({ title: 'Night', align: 'left' })).toEqual({
      onsocial: { article: { title: 'Night' } },
    });
  });

  it('stores non-left align', () => {
    expect(articleSnapshotExtra({ title: 'Night', align: 'justify' })).toEqual({
      onsocial: { article: { title: 'Night', align: 'justify' } },
    });
  });

  it('returns undefined without a title', () => {
    expect(articleSnapshotExtra({ title: '  ' })).toBeUndefined();
  });
});

describe('parseArticleSnapshot', () => {
  it('reads title and align', () => {
    expect(
      parseArticleSnapshot(
        postValue({
          x: { onsocial: { article: { title: 'Night', align: 'center' } } },
        })
      )
    ).toEqual({ title: 'Night', align: 'center' });
  });

  it('is null without a title', () => {
    expect(
      parseArticleSnapshot(postValue({ x: { onsocial: { article: {} } } }))
    ).toBeNull();
    expect(parseArticleSnapshot(postValue({}))).toBeNull();
    expect(isArticlePost({ value: postValue({}) })).toBe(false);
  });
});

describe('resolveComposerArticle', () => {
  it('returns null when blocked by poll or drop', () => {
    expect(
      resolveComposerArticle({ title: 'Night', align: 'left' }, true)
    ).toBeNull();
  });

  it('normalizes a titled draft', () => {
    expect(
      resolveComposerArticle({ title: '  Night  ', align: 'justify' })
    ).toEqual({ title: 'Night', align: 'justify' });
  });
});

describe('articleTeaseSource', () => {
  it('drops heading and list chrome and keeps inline marks', () => {
    expect(
      articleTeaseSource(
        [
          '# After midnight',
          '',
          'The highway *empties*. **Headlights** pick the rail.',
          '',
          '- First exit',
          '- Second thought',
        ].join('\n')
      )
    ).toBe(
      'After midnight The highway *empties*. **Headlights** pick the rail. First exit Second thought'
    );
  });

  it('leaves #near as a hashtag', () => {
    expect(articleTeaseSource('Collecting #near tonight.')).toBe(
      'Collecting #near tonight.'
    );
  });
});

describe('shouldShowWritingLink', () => {
  it('shows for the owner even before articles load', () => {
    expect(shouldShowWritingLink({ isOwner: true, hasArticles: null })).toBe(
      true
    );
    expect(shouldShowWritingLink({ isOwner: true, hasArticles: false })).toBe(
      true
    );
  });

  it('shows for visitors only after an article exists', () => {
    expect(shouldShowWritingLink({ isOwner: false, hasArticles: null })).toBe(
      false
    );
    expect(shouldShowWritingLink({ isOwner: false, hasArticles: false })).toBe(
      false
    );
    expect(shouldShowWritingLink({ isOwner: false, hasArticles: true })).toBe(
      true
    );
  });
});

describe('resolvePostCardOpenHref', () => {
  it('opens the article from the feed, not the thread', () => {
    expect(
      resolvePostCardOpenHref({
        articleHref: '/@alice/writing/p1',
        actionHref: '/@alice/post/p1',
      })
    ).toBe('/@alice/writing/p1');
  });

  it('keeps the thread URL on the detail page', () => {
    expect(
      resolvePostCardOpenHref({
        articleHref: '/@alice/writing/p1',
        actionHref: '/@alice/post/p1',
        detailLayout: true,
      })
    ).toBe('/@alice/post/p1');
  });

  it('falls back to the thread for untitled posts', () => {
    expect(
      resolvePostCardOpenHref({
        articleHref: null,
        actionHref: '/@alice/post/p1',
      })
    ).toBe('/@alice/post/p1');
  });
});

describe('resolveWritingEmptyState', () => {
  it('shows the owner compose CTA when compose is available', () => {
    expect(
      resolveWritingEmptyState({
        isOwner: true,
        articleCount: 0,
        matchCount: 0,
        canCompose: true,
      })
    ).toBe('owner-cta');
  });

  it('keeps owner copy without a compose handler', () => {
    expect(
      resolveWritingEmptyState({
        isOwner: true,
        articleCount: 0,
        matchCount: 0,
        canCompose: false,
      })
    ).toBe('owner-copy');
  });

  it('stays quiet for visitors and search misses', () => {
    expect(
      resolveWritingEmptyState({
        isOwner: false,
        articleCount: 0,
        matchCount: 0,
        canCompose: false,
      })
    ).toBe('visitor');
    expect(
      resolveWritingEmptyState({
        isOwner: true,
        articleCount: 2,
        matchCount: 0,
        canCompose: true,
      })
    ).toBe('no-match');
    expect(
      resolveWritingEmptyState({
        isOwner: true,
        articleCount: 2,
        matchCount: 1,
        canCompose: true,
      })
    ).toBeNull();
  });
});

describe('articleExcerpt and search', () => {
  it('uses stored excerpt when present', () => {
    expect(
      articleExcerpt(
        postValue({
          x: {
            onsocial: {
              article: { title: 'Night', excerpt: 'A short tease.' },
            },
          },
        })
      )
    ).toBe('A short tease.');
  });

  it('strips heading marks from a derived excerpt', () => {
    expect(
      articleExcerpt(
        postValue(
          { x: { onsocial: { article: { title: 'Night' } } } },
          '# After midnight\nThe highway *empties*.'
        )
      )
    ).toBe('After midnight The highway *empties*.');
  });

  it('matches title, body, and hashtags', () => {
    const value = postValue(
      {
        hashtags: ['lisbon'],
        x: { onsocial: { article: { title: 'Night drive' } } },
      },
      'Rain on the river.'
    );
    expect(articleMatchesQuery({ value }, 'drive')).toBe(true);
    expect(articleMatchesQuery({ value }, 'river')).toBe(true);
    expect(articleMatchesQuery({ value }, 'lisbon')).toBe(true);
    expect(articleMatchesQuery({ value }, 'tokyo')).toBe(false);
    expect(articleCoverUrl(value)).toBeNull();
  });
});
