import { describe, expect, it } from 'vitest';
import {
  isPageSectionVisible,
  pageDrawerJumpSections,
  resolvePageSections,
  resolveVisiblePageSections,
} from './page-sections';

const emptyStats = {
  standingCount: 0,
  postCount: 0,
  badgeCount: 0,
  groupCount: 0,
};

describe('resolvePageSections', () => {
  it('returns content-first defaults when sections are unset', () => {
    expect(resolvePageSections({})).toEqual([
      'posts',
      'groups',
      'collectibles',
      'links',
      'badges',
    ]);
  });

  it('honours owner order and drops profile and support from the drawer', () => {
    expect(
      resolvePageSections({
        sections: ['profile', 'support', 'collectibles', 'posts'],
      })
    ).toEqual(['collectibles', 'posts']);
  });
});

describe('resolveVisiblePageSections', () => {
  it('hides empty showcase sections including support', () => {
    expect(
      resolveVisiblePageSections(
        {},
        {
          stats: emptyStats,
          guilds: [],
          links: [],
        }
      )
    ).toEqual([]);
  });

  it('keeps posts and links when they have content', () => {
    expect(
      resolveVisiblePageSections(
        {},
        {
          stats: { ...emptyStats, postCount: 18 },
          guilds: [],
          links: [
            {
              key: 'website',
              kind: 'website',
              label: 'Website',
              href: 'https://example.com',
            },
          ],
        }
      )
    ).toEqual(['posts', 'links']);
  });
});

describe('pageDrawerJumpSections', () => {
  it('omits support from the jump rail', () => {
    expect(pageDrawerJumpSections(['posts', 'groups', 'support', 'links'])).toEqual([
      'posts',
      'groups',
      'links',
    ]);
  });
});

describe('isPageSectionVisible', () => {
  it('shows groups when guild cards exist even if stats lag', () => {
    expect(
      isPageSectionVisible('groups', {
        stats: emptyStats,
        guilds: [{ groupId: 'builders' } as never],
        links: [],
      })
    ).toBe(true);
  });

  it('shows posts from peeks when stats are still zero', () => {
    expect(
      isPageSectionVisible('posts', {
        stats: emptyStats,
        guilds: [],
        links: [],
        postPeekCount: 2,
      })
    ).toBe(true);
  });

  it('shows collectibles from scarce count and hides badges and support', () => {
    expect(
      isPageSectionVisible('collectibles', {
        stats: emptyStats,
        guilds: [],
        links: [],
        scarceCount: 3,
      })
    ).toBe(true);
    expect(
      isPageSectionVisible('badges', {
        stats: { ...emptyStats, badgeCount: 4 },
        guilds: [],
        links: [],
      })
    ).toBe(false);
    expect(
      isPageSectionVisible('support', {
        stats: emptyStats,
        guilds: [],
        links: [],
      })
    ).toBe(false);
  });
});
