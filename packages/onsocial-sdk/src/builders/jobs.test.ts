import { describe, expect, it } from 'vitest';
import {
  buildJobRemoveData,
  buildJobSetData,
  createJobId,
  isJobOpen,
  jobDateInputFromEnds,
  jobEndsFromDateInput,
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
    expect(() =>
      buildJobSetData('j-1', { title: '  ', ends: 1 })
    ).toThrow(/title/i);
    expect(normalizeJobTitle('  A'.repeat(50)).length).toBeLessThanOrEqual(80);
    expect(normalizeJobUrl('javascript:alert(1)')).toBe('');
    expect(normalizeJobUrl('http://insecure.example/x')).toBe('');
    expect(normalizeJobUrl('https://ok.example/x')).toBe(
      'https://ok.example/x'
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
});
