import { describe, expect, it } from 'vitest';
import {
  discoverProfilesEmptyLabel,
  hiringLineLabel,
} from '@/lib/profile-jobs';

describe('hiringLineLabel', () => {
  it('stays quiet at one role and counts after that', () => {
    expect(hiringLineLabel(1)).toBe('Hiring');
    expect(hiringLineLabel(3)).toBe('Hiring · 3');
  });
});

describe('discoverProfilesEmptyLabel', () => {
  it('names hiring and org empties', () => {
    expect(discoverProfilesEmptyLabel(false, '', 'hiring')).toBe(
      'No orgs hiring yet.'
    );
    expect(discoverProfilesEmptyLabel(false, '', 'orgs', 'Healthcare')).toBe(
      'No organizations in Healthcare yet.'
    );
  });
});
