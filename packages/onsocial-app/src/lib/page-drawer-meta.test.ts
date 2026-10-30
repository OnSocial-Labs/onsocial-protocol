import { describe, expect, it } from 'vitest';
import {
  formatCompactCount,
  formatDaoRoleLabel,
  formatPageDrawerCredentialsLine,
  formatPageDrawerJoinedDateTimeLabel,
  formatPageDrawerJoinedFullLabel,
  formatPageDrawerJoinedLabel,
  formatPageDrawerUpdatedFieldsLine,
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

  it('formats a date with the clock', () => {
    const ms = Date.UTC(2026, 8, 26, 12, 33);
    expect(formatPageDrawerJoinedDateTimeLabel(ms)).toBe(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(ms))
    );
  });

  it('returns null for missing timestamps', () => {
    expect(formatPageDrawerJoinedLabel(null)).toBeNull();
    expect(formatPageDrawerJoinedLabel(0)).toBeNull();
  });
});

describe('formatCompactCount', () => {
  it('keeps small counts exact and compacts thousands', () => {
    expect(formatCompactCount(18)).toBe('18');
    expect(formatCompactCount(1540)).toBe('1.5K');
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
    expect(formatDaoRoleLabel('delegated_proposers')).toBe('Proposers');
    expect(formatDaoRoleLabel('token_holders')).toBe('Token Holders');
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
