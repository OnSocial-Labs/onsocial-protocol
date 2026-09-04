import { describe, expect, it } from 'vitest';
import {
  buildJobRemoveData,
  buildJobSetData,
  createJobId,
  formatJobClosesLabel,
  formatJobEndsLabel,
  formatJobListingMetaLabel,
  hiringLineAriaLabel,
  hiringLineLabel,
  isJobOpen,
  jobDateInputFromEnds,
  jobEndsFromDateInput,
  normalizeJobDescription,
  normalizeJobTitle,
  normalizeJobUrl,
  todayDateInput,
} from './jobs.js';

describe('jobs builder', () => {
  it('writes a compact jobs/<id> payload', () => {
    expect(
      buildJobSetData('j-1', {
        title: '  Designer  ',
        description: 'Brand work',
        url: 'https://studio.example/apply',
        ends: 1_800_000_000_000,
        since: 1_700_000_000_000,
      })
    ).toEqual({
      'jobs/j-1': {
        v: 1,
        title: 'Designer',
        description: 'Brand work',
        url: 'https://studio.example/apply',
        ends: 1_800_000_000_000,
        since: 1_700_000_000_000,
      },
    });
  });

  it('rejects empty titles and drops bad apply URLs', () => {
    expect(() => buildJobSetData('j-1', { title: '  ', ends: 1 })).toThrow(
      /title/i
    );
    expect(normalizeJobTitle('  A'.repeat(50)).length).toBeLessThanOrEqual(80);
    expect(normalizeJobUrl('javascript:alert(1)')).toBe('');
    expect(normalizeJobUrl('http://insecure.example/x')).toBe('');
    expect(normalizeJobUrl('https://ok.example/x')).toBe(
      'https://ok.example/x'
    );
    expect(normalizeJobUrl('onsocial.id')).toBe('https://onsocial.id/');
    expect(normalizeJobUrl('onsocial.id/careers')).toBe(
      'https://onsocial.id/careers'
    );
  });

  it('tombstones a job and treats past ends as closed', () => {
    expect(buildJobRemoveData('j-1')).toEqual({ 'jobs/j-1': null });
    expect(createJobId(1).startsWith('j-')).toBe(true);
    expect(isJobOpen(2, 1)).toBe(true);
    expect(isJobOpen(1, 2)).toBe(false);
  });

  it('rounds a calendar date to the local end of day', () => {
    const ends = jobEndsFromDateInput('2026-09-03');
    expect(jobDateInputFromEnds(ends)).toBe('2026-09-03');
    expect(ends).toBeGreaterThan(jobEndsFromDateInput('2026-09-02'));
    expect(todayDateInput(Date.UTC(2026, 8, 3))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps a single open role labeled Hiring', () => {
    expect(hiringLineLabel(1)).toBe('Hiring');
    expect(hiringLineLabel(3)).toBe('Hiring · 3');
    expect(hiringLineAriaLabel(1)).toBe('View open role');
    expect(hiringLineAriaLabel(4)).toBe('View 4 open roles');
  });

  it('labels job close dates as Closes, not Ends', () => {
    const ends = jobEndsFromDateInput('2026-09-06');
    expect(formatJobClosesLabel(ends)).toMatch(/^Closes /);
    expect(formatJobClosesLabel(ends)).toContain(formatJobEndsLabel(ends));
    expect(formatJobClosesLabel(Number.NaN)).toBe('');
  });

  it('labels past ends as Closed for manage lists', () => {
    const ends = jobEndsFromDateInput('2026-09-06');
    expect(formatJobListingMetaLabel(ends, ends - 1)).toMatch(/^Closes /);
    expect(formatJobListingMetaLabel(ends, ends + 1)).toMatch(/^Closed /);
  });

  it('keeps newlines and list marks in job descriptions', () => {
    expect(
      normalizeJobDescription('Ship UI.\n\n- **React**\n- *TypeScript*')
    ).toBe('Ship UI.\n\n- **React**\n- *TypeScript*');
    expect(normalizeJobDescription('  a   b  \n\n\n  c  ')).toBe('a b\n\nc');
  });
});
