import { describe, expect, it } from 'vitest';
import {
  ARTICLE_TITLE_MAX,
  articleCoverUrl,
  articleExcerpt,
  articleMatchesQuery,
  articleSnapshotExtra,
  articleTeaseSource,
  isArticlePost,
  normalizeArticleCoverMood,
  normalizeArticleTitle,
  parseArticleSnapshot,
  resolveArticleCover,
  resolveComposerArticle,
  resolvePostCardOpenHref,
  resolveWritingEmptyState,
  shouldShowWritingLink,
  shouldShowWritingSearch,
  resolveWritingListQuery,
  resolveWritingShelfCount,
  formatWritingArticleCountLabel,
  formatWritingLikeLabel,
  formatWritingReadLabel,
  WRITING_SEARCH_MIN_ARTICLES,
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

const DEFAULT_COVER = {
  mood: 'thought-night',
  format: 'thought',
  markShape: 'rule',
  markColor: 'auto',
} as const;

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
      onsocial: {
        article: { title: 'Night', cover: { ...DEFAULT_COVER } },
      },
    });
  });

  it('stores non-left align', () => {
    expect(articleSnapshotExtra({ title: 'Night', align: 'justify' })).toEqual({
      onsocial: {
        article: {
          title: 'Night',
          align: 'justify',
          cover: { ...DEFAULT_COVER },
        },
      },
    });
  });

  it('pins the picked cover mood', () => {
    expect(
      articleSnapshotExtra({ title: 'Night', coverMood: 'poster-noir' })
    ).toEqual({
      onsocial: {
        article: {
          title: 'Night',
          cover: {
            mood: 'poster-noir',
            format: 'poster',
            markShape: 'rule',
            markColor: 'auto',
          },
        },
      },
    });
  });

  it('pins the full cover craft', () => {
    expect(
      articleSnapshotExtra({
        title: 'Night',
        cover: {
          mood: 'letter-light',
          format: 'letter',
          markShape: 'dot',
          markColor: 'violet',
        },
      })
    ).toEqual({
      onsocial: {
        article: {
          title: 'Night',
          cover: {
            mood: 'letter-light',
            format: 'letter',
            markShape: 'dot',
            markColor: 'violet',
          },
        },
      },
    });
  });

  it('falls back to the default mood for unknown keys', () => {
    expect(
      articleSnapshotExtra({ title: 'Night', coverMood: 'not-a-mood' })
    ).toEqual({
      onsocial: {
        article: { title: 'Night', cover: { ...DEFAULT_COVER } },
      },
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

  it('round-trips the pinned cover mood', () => {
    const extra = articleSnapshotExtra({
      title: 'Night',
      coverMood: 'journal-light',
    });
    expect(parseArticleSnapshot(postValue({ x: extra }))).toEqual({
      title: 'Night',
      align: 'left',
      cover: {
        mood: 'journal-light',
        format: 'journal',
        markShape: 'rule',
        markColor: 'auto',
      },
    });
  });

  it('fills craft defaults for legacy mood-only covers', () => {
    expect(
      parseArticleSnapshot(
        postValue({
          x: {
            onsocial: {
              article: { title: 'Night', cover: { mood: 'mono-noir' } },
            },
          },
        })
      )
    ).toEqual({
      title: 'Night',
      align: 'left',
      cover: {
        mood: 'mono-noir',
        format: 'mono',
        markShape: 'rule',
        markColor: 'auto',
      },
    });
  });

  it('drops an unknown stored mood', () => {
    expect(
      parseArticleSnapshot(
        postValue({
          x: {
            onsocial: {
              article: { title: 'Night', cover: { mood: 'nope' } },
            },
          },
        })
      )
    ).toEqual({ title: 'Night', align: 'left' });
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
    ).toEqual({
      title: 'Night',
      align: 'justify',
      cover: { ...DEFAULT_COVER },
    });
  });

  it('keeps a picked cover mood', () => {
    expect(
      resolveComposerArticle({ title: 'Night', coverMood: 'mono-noir' })
    ).toEqual({
      title: 'Night',
      align: 'left',
      cover: {
        mood: 'mono-noir',
        format: 'mono',
        markShape: 'rule',
        markColor: 'auto',
      },
    });
  });

  it('prefers a full cover pin over coverMood', () => {
    expect(
      resolveComposerArticle({
        title: 'Night',
        coverMood: 'mono-noir',
        cover: {
          mood: 'letter-light',
          format: 'letter',
          markShape: 'dot',
          markColor: 'violet',
        },
      })
    ).toEqual({
      title: 'Night',
      align: 'left',
      cover: {
        mood: 'letter-light',
        format: 'letter',
        markShape: 'dot',
        markColor: 'violet',
      },
    });
  });
});

describe('normalizeArticleCoverMood', () => {
  it('canonicalizes legacy voice aliases', () => {
    expect(normalizeArticleCoverMood('bold-night')).toBe('thought-night');
    expect(normalizeArticleCoverMood('mono-matrix')).toBe('mono-matrix');
  });

  it('rejects non-strings and unknown keys', () => {
    expect(normalizeArticleCoverMood(undefined)).toBeNull();
    expect(normalizeArticleCoverMood(42)).toBeNull();
    expect(normalizeArticleCoverMood('nope')).toBeNull();
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

  it('drops a pasted snippet, including hash lines inside the fence', () => {
    expect(
      articleTeaseSource(
        'Before\n```\n# include <stdio.h>\nint main() {}\n```\nAfter'
      )
    ).toBe('Before After');
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

  it('opens the other post thread when the host prefers actionHref', () => {
    expect(
      resolvePostCardOpenHref({
        articleHref: '/@alice/writing/p2',
        actionHref: '/@alice/posts/p2',
        preferActionHref: true,
      })
    ).toBe('/@alice/posts/p2');
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

describe('shouldShowWritingSearch', () => {
  it('always shows chrome search', () => {
    expect(WRITING_SEARCH_MIN_ARTICLES).toBe(0);
    expect(shouldShowWritingSearch(0)).toBe(true);
    expect(shouldShowWritingSearch(3)).toBe(true);
    expect(shouldShowWritingSearch(4)).toBe(true);
  });
});

describe('resolveWritingListQuery', () => {
  it('keeps the deferred needle while typing', () => {
    expect(resolveWritingListQuery('lis', 'li')).toBe('li');
    expect(resolveWritingListQuery('lisbon', 'lisbon')).toBe('lisbon');
  });

  it('flushes immediately when the field clears', () => {
    expect(resolveWritingListQuery('', 'lisbon')).toBe('');
    expect(resolveWritingListQuery('   ', 'lisbon')).toBe('   ');
  });
});

describe('formatWritingArticleCountLabel', () => {
  it('singular and plural', () => {
    expect(formatWritingArticleCountLabel(0)).toBe('0 articles');
    expect(formatWritingArticleCountLabel(1)).toBe('1 article');
    expect(formatWritingArticleCountLabel(3)).toBe('3 articles');
  });
});

describe('resolveWritingShelfCount', () => {
  it('keeps the published total until there is a query', () => {
    expect(resolveWritingShelfCount(3, 3, '')).toBe(3);
    expect(resolveWritingShelfCount(3, 3, '   ')).toBe(3);
  });

  it('follows visible matches while searching', () => {
    expect(resolveWritingShelfCount(3, 1, 'lisbon')).toBe(1);
    expect(resolveWritingShelfCount(3, 0, 'tokyo-miss')).toBe(0);
  });
});

describe('writing cover + read label', () => {
  it('prefers scarce media when the post has no still', () => {
    const value = postValue({
      x: { onsocial: { article: { title: 'Night' } } },
    });
    expect(articleCoverUrl(value)).toBeNull();
    expect(
      resolveArticleCover({
        value,
        scarceMediaUrl: 'https://cdn.example/cover.png',
      })
    ).toEqual({
      coverUrl: 'https://cdn.example/cover.png',
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: false,
    });
  });

  it('reads drop paint media as a local cover', () => {
    const value = postValue({
      x: {
        onsocial: {
          article: { title: 'Night' },
          drop: {
            collectionId: 'drop-1',
            mediaUrl: 'https://cdn.example/drop.png',
          },
        },
      },
    });
    expect(articleCoverUrl(value)).toBe('https://cdn.example/drop.png');
  });

  it('labels longer pieces with a read time', () => {
    expect(formatWritingReadLabel('Short.')).toBeNull();
    expect(
      formatWritingReadLabel(
        Array.from({ length: 220 }, () => 'word').join(' ')
      )
    ).toBe('1 min read');
  });
});

describe('formatWritingLikeLabel', () => {
  it('omits zeros and pluralizes', () => {
    expect(formatWritingLikeLabel(0)).toBeNull();
    expect(formatWritingLikeLabel(1)).toBe('1 like');
    expect(formatWritingLikeLabel(12)).toBe('12 likes');
  });
});

describe('resolveArticleCover', () => {
  it('uses the selected photo instead of a stored mood cover', () => {
    const value = postValue({
      media: ['https://cdn.example/photo.jpg'],
      x: {
        onsocial: {
          article: { title: 'Night', cover: { mood: 'poster-noir' } },
        },
      },
    });
    expect(resolveArticleCover({ value })).toEqual({
      coverUrl: 'https://cdn.example/photo.jpg',
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: true,
    });
  });

  it('uses the pinned mood over scarce hints', () => {
    const value = postValue({
      x: {
        onsocial: {
          article: { title: 'Night', cover: { mood: 'journal-light' } },
        },
      },
    });
    expect(
      resolveArticleCover({
        value,
        scarceMediaUrl: 'https://cdn.example/minted.png',
        scarceCardBg: 'mono-noir',
      })
    ).toEqual({
      coverUrl: null,
      cardBg: 'journal-light',
      format: 'journal',
      markShape: 'rule',
      markColor: 'auto',
      pinned: true,
    });
  });

  it('falls back to the scarce card mood for legacy articles', () => {
    const value = postValue({
      x: { onsocial: { article: { title: 'Night' } } },
    });
    expect(resolveArticleCover({ value, scarceCardBg: 'dusk' })).toEqual({
      coverUrl: null,
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: false,
    });
    expect(resolveArticleCover({ value, scarceCardBg: 'journal-sky' })).toEqual(
      {
        coverUrl: null,
        cardBg: 'journal-sky',
        format: null,
        markShape: null,
        markColor: null,
        pinned: false,
      }
    );
  });

  it('defaults to the default card for legacy articles without hints', () => {
    const value = postValue({
      x: { onsocial: { article: { title: 'Night' } } },
    });
    expect(resolveArticleCover({ value })).toEqual({
      coverUrl: null,
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: false,
    });
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
