import { describe, expect, it } from 'vitest';
import { hiringLineLabel } from './profile-jobs';

describe('hiringLineLabel', () => {
  it('stays quiet at one role and counts after that', () => {
    expect(hiringLineLabel(1)).toBe('Hiring');
    expect(hiringLineLabel(3)).toBe('Hiring · 3');
  });
});
