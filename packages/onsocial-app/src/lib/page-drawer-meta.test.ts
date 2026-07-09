import { describe, expect, it } from 'vitest';
import {
  formatCompactCount,
  formatDaoRoleLabel,
  formatPageDrawerActivityLine,
  formatPageDrawerCredentialsLine,
  formatPageDrawerJoinedFullLabel,
  formatPageDrawerJoinedLabel,
  formatPageDrawerUpdatedFieldsLine,
  pageDrawerActivityParts,
  resolveLatestProfileUpdateFields,
  shouldShowProfileUpdated,
  sortDaoRoleIds,
} from './page-drawer-meta';

describe('formatPageDrawerJoinedLabel', () => {
  it('formats month and year', () => {
    expect(formatPageDrawerJoinedLabel(Date.UTC(2025, 2, 15))).toBe('Mar 2025');
  });

  it('formats full calendar date', () => {
    expect(formatPageDrawerJoinedFullLabel(Date.UTC(2025, 2, 15))).toBe(
      'Mar 15, 2025'
    );
  });

  it('returns null for missing timestamps', () => {
    expect(formatPageDrawerJoinedLabel(null)).toBeNull();
    expect(formatPageDrawerJoinedLabel(0)).toBeNull();
  });
});

describe('pageDrawerActivityParts', () => {
  it('omits zero counts', () => {
    expect(
      pageDrawerActivityParts({
        postCount: 18,
        guildCount: 12,
        scarceMintCount: 0,
      })
    ).toEqual([
      { key: 'posts', count: '18', unit: 'posts' },
      { key: 'guilds', count: '12', unit: 'guilds' },
    ]);
  });

  it('compacts large counts', () => {
    expect(
      pageDrawerActivityParts({
        postCount: 1540,
        guildCount: 0,
        scarceMintCount: 0,
      })
    ).toEqual([{ key: 'posts', count: '1.5K', unit: 'posts' }]);
  });
});

describe('formatCompactCount', () => {
  it('keeps small counts exact and compacts thousands', () => {
    expect(formatCompactCount(18)).toBe('18');
    expect(formatCompactCount(1540)).toBe('1.5K');
  });
});

describe('formatPageDrawerActivityLine', () => {
  it('omits zero counts and keeps joined', () => {
    expect(
      formatPageDrawerActivityLine({
        postCount: 12,
        guildCount: 0,
        scarceMintCount: 3,
        joinedAt: Date.UTC(2025, 2, 1),
      })
    ).toBe('12 posts · 3 scarces · Joined Mar 2025');
  });

  it('returns null when nothing to show', () => {
    expect(
      formatPageDrawerActivityLine({
        postCount: 0,
        guildCount: 0,
        scarceMintCount: 0,
        joinedAt: null,
      })
    ).toBeNull();
  });
});

describe('formatPageDrawerCredentialsLine', () => {
  it('joins dao roles only', () => {
    expect(
      formatPageDrawerCredentialsLine({
        daoRoleLabels: ['Guardian', 'Council'],
      })
    ).toBe('Guardian · Council');
  });

  it('returns null when no roles', () => {
    expect(formatPageDrawerCredentialsLine({ daoRoleLabels: [] })).toBeNull();
  });
});

describe('dao role helpers', () => {
  it('formats and sorts guardians before council', () => {
    expect(formatDaoRoleLabel('guardians')).toBe('Guardian');
    expect(sortDaoRoleIds(['council', 'guardians'])).toEqual([
      'guardians',
      'council',
    ]);
  });
});

describe('profile update fields', () => {
  it('resolves latest write fields and caps overflow', () => {
    expect(
      resolveLatestProfileUpdateFields([
        {
          field: 'name',
          blockHeight: 10,
          blockTimestamp: 100,
        },
        {
          field: 'banner',
          blockHeight: 20,
          blockTimestamp: 200,
        },
        {
          field: 'tags',
          blockHeight: 20,
          blockTimestamp: 200,
        },
        {
          field: 'bio',
          blockHeight: 20,
          blockTimestamp: 200,
        },
        {
          field: 'avatar',
          blockHeight: 20,
          blockTimestamp: 200,
        },
        {
          field: 'links',
          blockHeight: 20,
          blockTimestamp: 200,
        },
      ])
    ).toEqual({
      updatedAt: 200,
      fields: ['Banner', 'Tags', 'Bio', 'Avatar', '+1'],
    });
  });

  it('hides updated when same calendar day as joined', () => {
    const day = Date.UTC(2026, 2, 9, 12);
    expect(shouldShowProfileUpdated(day, day + 3_600_000)).toBe(false);
    expect(shouldShowProfileUpdated(day, Date.UTC(2026, 2, 12, 12))).toBe(true);
  });

  it('formats fields line', () => {
    expect(formatPageDrawerUpdatedFieldsLine(['Name', 'Banner'])).toBe(
      'Name · Banner'
    );
  });

  it('fuses date and fields for one Updated row', () => {
    const date = formatPageDrawerJoinedFullLabel(Date.UTC(2026, 2, 12));
    const fields = formatPageDrawerUpdatedFieldsLine(['Name', 'Banner']);
    expect(`${date} · ${fields}`).toBe('Mar 12, 2026 · Name · Banner');
  });
});
