import { describe, expect, it } from 'vitest';
import {
  isPageSectionVisible,
  pageDrawerJumpSections,
  pageDrawerSectionDomId,
  resolvePageDrawerActiveSection,
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
      'store',
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

describe('pageDrawerSectionDomId', () => {
  it('builds stable section element ids', () => {
    expect(pageDrawerSectionDomId('posts')).toBe('page-drawer-section-posts');
    expect(pageDrawerSectionDomId('groups')).toBe('page-drawer-section-groups');
  });
});

describe('resolvePageDrawerActiveSection', () => {
  it('picks the last section that has crossed the marker', () => {
    expect(
      resolvePageDrawerActiveSection(
        ['posts', 'groups', 'links'],
        [100, 40, 200],
        50
      )
    ).toBe('groups');
  });

  it('forces the last section when scrolled to the end', () => {
    expect(
      resolvePageDrawerActiveSection(
        ['posts', 'groups', 'links'],
        [10, 80, 160],
        50,
        true
      )
    ).toBe('links');
  });

  it('keeps a middle section when end-force is off', () => {
    expect(
      resolvePageDrawerActiveSection(
        ['posts', 'groups', 'links'],
        [-40, 8, 120],
        50,
        false
      )
    ).toBe('groups');
  });

  it('returns null when there are no sections', () => {
    expect(resolvePageDrawerActiveSection([], [], 50)).toBeNull();
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

  it('shows store when the account has live listings', () => {
    expect(
      isPageSectionVisible('store', {
        stats: emptyStats,
        guilds: [],
        links: [],
        storeListingCount: 2,
      })
    ).toBe(true);
    expect(
      isPageSectionVisible('store', {
        stats: emptyStats,
        guilds: [],
        links: [],
      })
    ).toBe(false);
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
