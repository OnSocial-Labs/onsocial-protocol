import { describe, expect, it } from 'vitest';
import { resolvePageSections } from './page-sections';

describe('resolvePageSections', () => {
  it('returns defaults when sections are unset', () => {
    expect(resolvePageSections({})).toEqual([
      'posts',
      'collectibles',
      'links',
      'badges',
    ]);
  });

  it('honours owner order and drops profile from the drawer', () => {
    expect(
      resolvePageSections({
        sections: ['profile', 'collectibles', 'posts'],
      })
    ).toEqual(['collectibles', 'posts']);
  });
});
