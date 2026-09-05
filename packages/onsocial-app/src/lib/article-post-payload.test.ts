import { describe, expect, it } from 'vitest';
import {
  ARTICLE_TITLE_MAX,
  articleCoverUrl,
  articleExcerpt,
  articleMatchesQuery,
  articleSnapshotExtra,
  isArticlePost,
  normalizeArticleTitle,
  parseArticleSnapshot,
  resolveComposerArticle,
} from './article-post-payload';

function postValue(extra: Record<string, unknown>, text = 'Body of the piece.') {
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
